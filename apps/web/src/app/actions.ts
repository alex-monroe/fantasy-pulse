'use server';

import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { logDuration, logEvent, startTimer } from '@/utils/performance-logger';
import {
  getCurrentSleeperLeagues,
  getLeagueScoringSettings,
  getWeeklyProjections,
  getNflState,
} from '@/app/integrations/sleeper/actions';
import {
  getYahooUserTeams,
  getYahooRoster,
  getYahooMatchups,
  getYahooPlayerScores,
  getYahooAccessToken,
} from '@/app/integrations/yahoo/actions';
import {
  getLeagues as getOttoneuLeagues,
  getOttoneuTeamInfo,
} from '@/app/integrations/ottoneu/actions';
import {
  getLeagues as getEspnLeagues,
  getTeams as getEspnTeamRows,
  getEspnMatchup,
  type EspnRosterPlayer,
} from '@/app/integrations/espn/actions';
import {
  mapSleeperPlayer,
  generateDemoTeams,
  scoreStockProjection,
} from '@roster-loom/core';
import {
  Team,
  Player,
  SleeperLeague,
  SleeperRoster,
  SleeperMatchup,
  SleeperUser,
  SleeperPlayer,
  SleeperProjection,
  SleeperStockScoringMode,
} from '@roster-loom/core';
import { isDemoModeEnv } from '@/lib/demo-mode';
import { findBestMatch } from 'string-similarity';
import { JSDOM } from 'jsdom';

const SLEEPER_HEADSHOT_BASE_URL =
  'https://sleepercdn.com/content/nfl/players/thumb';
const SLEEPER_DEFAULT_HEADSHOT_URL =
  'https://sleepercdn.com/images/v2/icons/player_default.webp';

const IGNORED_ROSTER_SPOTS = new Set(['BN', 'BENCH', 'FLX', 'SFLX']);

type SleeperIdResolver = (playerName: string) => string | null;

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

const TEAM_ABBREVIATION_ALIASES: Record<string, string[]> = {
  WSH: ['WAS'],
  JAX: ['JAC'],
};

const SLEEPER_PLAYERS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Scoring profile used to turn a Sleeper projection into a point total for
 * Yahoo/Ottoneu/ESPN players, whose leagues' real scoring settings this app
 * can't read. Sleeper leagues score against their own actual settings
 * instead (see `buildSleeperTeams`). Swap this (or thread a per-league
 * override through the builders below) once per-league scoring selection
 * exists.
 */
const DEFAULT_NON_SLEEPER_PROJECTION_SCORING: SleeperStockScoringMode = 'half_ppr';

type SleeperPlayersResources = {
  playersData: Record<string, SleeperPlayer>;
  playerNameMap: { [key: string]: string };
};

let sleeperPlayersCachePromise: Promise<SleeperPlayersResources> | null = null;
let sleeperPlayersCacheExpiresAt = 0;

type TeamGameInfo = {
  status: 'pregame' | 'in_progress' | 'final';
  startDate: string | null;
  quarter: string | null;
  clock: string | null;
};

function formatScoreboardPeriod(period: unknown): string | null {
  if (typeof period !== 'number' || period <= 0) {
    return null;
  }

  if (period <= 4) {
    return `Q${period}`;
  }

  const overtimeNumber = period - 4;
  if (overtimeNumber === 1) {
    return 'OT';
  }

  return `${overtimeNumber}OT`;
}

function buildTeamGameInfoMap(scoreboard: any): Map<string, TeamGameInfo> {
  const map = new Map<string, TeamGameInfo>();

  if (!scoreboard || !Array.isArray(scoreboard.events)) {
    return map;
  }

  for (const event of scoreboard.events) {
    const competition = event?.competitions?.[0];
    if (!competition) {
      continue;
    }

    const competitionStatus = competition?.status?.type;
    const eventStatus = event?.status?.type;
    const state = competitionStatus?.state || eventStatus?.state;

    let status: TeamGameInfo['status'] | null = null;
    if (state === 'pre') {
      status = 'pregame';
    } else if (state === 'in') {
      status = 'in_progress';
    } else if (state === 'post') {
      status = 'final';
    }

    if (!status) {
      continue;
    }

    const startDate =
      typeof competition?.startDate === 'string'
        ? competition.startDate
        : typeof event?.date === 'string'
          ? event.date
          : null;

    const displayClock =
      competition?.status?.displayClock ?? event?.status?.displayClock ?? null;
    const period =
      competition?.status?.period ?? event?.status?.period ?? null;
    const shortDetail =
      competitionStatus?.shortDetail || eventStatus?.shortDetail || null;

    let quarter: string | null = null;
    let clock: string | null = null;

    if (status === 'in_progress') {
      quarter = formatScoreboardPeriod(period);
      clock = typeof displayClock === 'string' ? displayClock : null;
    } else if (status === 'final') {
      if (typeof shortDetail === 'string' && shortDetail.trim()) {
        quarter = shortDetail;
      } else {
        quarter = 'Final';
      }
    }

    const info: TeamGameInfo = {
      status,
      startDate,
      quarter,
      clock,
    };

    const competitors = Array.isArray(competition?.competitors)
      ? competition.competitors
      : [];

    for (const competitor of competitors) {
      const abbr = competitor?.team?.abbreviation;
      if (!abbr || typeof abbr !== 'string') {
        continue;
      }

      const normalized = abbr.toUpperCase();
      map.set(normalized, info);

      const aliases = TEAM_ABBREVIATION_ALIASES[normalized];
      if (aliases) {
        for (const alias of aliases) {
          map.set(alias.toUpperCase(), info);
        }
      }
    }
  }

  return map;
}

function normalizePlayerName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function sanitizePlayerName(name: string) {
  return normalizePlayerName(name.replace(/[^a-z0-9\s]/gi, ' '));
}

function normalizeOttoneuTeamName(name: string) {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractNameParts(name: string): { first: string; last: string } {
  const tokens = name.split(' ').filter(Boolean);
  if (tokens.length === 0) {
    return { first: '', last: '' };
  }

  let end = tokens.length - 1;
  while (end >= 0 && NAME_SUFFIXES.has(tokens[end])) {
    end -= 1;
  }

  if (end < 0) {
    end = tokens.length - 1;
  }

  const meaningfulTokens = tokens.slice(0, end + 1);
  const last = tokens[end] ?? '';

  let first = meaningfulTokens[0] ?? '';
  if (first.length === 1 && meaningfulTokens.length > 1) {
    const second = meaningfulTokens[1];
    if (second && second.length === 1) {
      first = `${first}${second}`;
    }
  }

  return { first, last };
}

function isStrongNameMatch({
  sourceName,
  targetName,
  rating,
}: {
  sourceName: string;
  targetName: string;
  rating: number;
}): boolean {
  if (!sourceName || !targetName) {
    return false;
  }

  if (sourceName === targetName) {
    return true;
  }

  const sourceParts = extractNameParts(sourceName);
  const targetParts = extractNameParts(targetName);

  if (!sourceParts.last || !targetParts.last || sourceParts.last !== targetParts.last) {
    return false;
  }

  if (!sourceParts.first || !targetParts.first) {
    return rating >= 0.6;
  }

  if (sourceParts.first === targetParts.first) {
    return rating >= 0.6;
  }

  if (
    rating >= 0.7 &&
    (sourceParts.first.startsWith(targetParts.first) ||
      targetParts.first.startsWith(sourceParts.first))
  ) {
    return true;
  }

  return false;
}

function createSleeperIdResolver(
  playerNameMap: { [key: string]: string }
): SleeperIdResolver {
  const normalizedMap = new Map<string, string>();

  for (const [rawName, id] of Object.entries(playerNameMap)) {
    const normalizedName = normalizePlayerName(rawName);
    if (normalizedName && !normalizedMap.has(normalizedName)) {
      normalizedMap.set(normalizedName, id);
    }

    const sanitizedName = sanitizePlayerName(rawName);
    if (sanitizedName && !normalizedMap.has(sanitizedName)) {
      normalizedMap.set(sanitizedName, id);
    }
  }

  const normalizedNames = Array.from(normalizedMap.keys());

  return (playerName: string) => {
    const normalizedName = normalizePlayerName(playerName);
    if (!normalizedName) {
      return null;
    }

    const directMatch = normalizedMap.get(normalizedName);
    if (directMatch) {
      return directMatch;
    }

    const sanitizedName = sanitizePlayerName(playerName);
    if (sanitizedName) {
      const sanitizedMatch = normalizedMap.get(sanitizedName);
      if (sanitizedMatch) {
        return sanitizedMatch;
      }
    }

    if (normalizedNames.length === 0) {
      return null;
    }

    const { bestMatch } = findBestMatch(normalizedName, normalizedNames);
    if (
      bestMatch.rating > 0.5 &&
      isStrongNameMatch({
        sourceName: normalizedName,
        targetName: bestMatch.target,
        rating: bestMatch.rating,
      })
    ) {
      const matchedId = normalizedMap.get(bestMatch.target);
      if (matchedId) {
        return matchedId;
      }
    }

    if (sanitizedName && sanitizedName !== normalizedName) {
      const { bestMatch: sanitizedBestMatch } = findBestMatch(
        sanitizedName,
        normalizedNames
      );
      if (
        sanitizedBestMatch.rating > 0.5 &&
        isStrongNameMatch({
          sourceName: sanitizedName,
          targetName: sanitizedBestMatch.target,
          rating: sanitizedBestMatch.rating,
        })
      ) {
        const matchedId = normalizedMap.get(sanitizedBestMatch.target);
        if (matchedId) {
          return matchedId;
        }
      }
    }

    return null;
  };
}

function getSleeperHeadshotUrl(sleeperId: string | null) {
  return sleeperId
    ? `${SLEEPER_HEADSHOT_BASE_URL}/${sleeperId}.jpg`
    : SLEEPER_DEFAULT_HEADSHOT_URL;
}

/**
 * Gets the current NFL week from the Sleeper API.
 * @returns The current NFL week.
 */
export async function getCurrentNflWeek() {
  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  return nflState.week;
}

async function loadSleeperPlayersResources(): Promise<SleeperPlayersResources> {
  const playersFetchStart = startTimer();
  const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
  logDuration('getTeams: fetch Sleeper players', playersFetchStart, {
    status: playersResponse.status,
    ok: playersResponse.ok,
  });

  const playersParseStart = startTimer();
  const playersJson = await playersResponse.json();
  logDuration('getTeams: parse Sleeper players response', playersParseStart);

  const playersData =
    playersJson && typeof playersJson === 'object'
      ? (playersJson as Record<string, SleeperPlayer>)
      : ({} as Record<string, SleeperPlayer>);

  const playerNameMap: { [key: string]: string } = {};
  const playerMapBuildStart = startTimer();
  const playerIds = Object.keys(playersData);
  const totalPlayers = playerIds.length;

  const addPlayerName = (name: string | null | undefined, playerId: string) => {
    if (!name) {
      return;
    }

    const normalizedName = normalizePlayerName(name);
    if (!normalizedName) {
      return;
    }

    playerNameMap[normalizedName] = playerId;

    const sanitizedName = sanitizePlayerName(name);
    if (sanitizedName && sanitizedName !== normalizedName) {
      playerNameMap[sanitizedName] = playerId;
    }
  };

  for (const playerId of playerIds) {
    const player = playersData[playerId];
    if (!player) {
      continue;
    }

    addPlayerName(player.full_name ?? null, playerId);

    const combinedName = [player.first_name, player.last_name]
      .filter((part) => part && part.trim())
      .join(' ');
    addPlayerName(combinedName || null, playerId);
  }

  logDuration('getTeams: build Sleeper player name map', playerMapBuildStart, {
    totalPlayers,
    uniqueNames: Object.keys(playerNameMap).length,
  });

  return { playersData, playerNameMap };
}

export async function getSleeperPlayersResources({
  forceRefresh = false,
}: { forceRefresh?: boolean } = {}): Promise<SleeperPlayersResources> {
  const now = Date.now();

  if (!forceRefresh && sleeperPlayersCachePromise && now < sleeperPlayersCacheExpiresAt) {
    return sleeperPlayersCachePromise;
  }

  const loadPromise = loadSleeperPlayersResources()
    .then((result) => {
      sleeperPlayersCacheExpiresAt = Date.now() + SLEEPER_PLAYERS_CACHE_TTL_MS;
      return result;
    })
    .catch((error) => {
      if (sleeperPlayersCachePromise === loadPromise) {
        sleeperPlayersCachePromise = null;
        sleeperPlayersCacheExpiresAt = 0;
      }
      throw error;
    });

  sleeperPlayersCachePromise = loadPromise;
  sleeperPlayersCacheExpiresAt = Number.POSITIVE_INFINITY;

  return sleeperPlayersCachePromise;
}

export async function invalidateSleeperPlayersCache() {
  sleeperPlayersCachePromise = null;
  sleeperPlayersCacheExpiresAt = 0;
}

/**
 * Derives a stable numeric team id from a Sleeper league id.
 *
 * Sleeper's leagues endpoint returns only the string `league_id` — there is
 * no numeric `id` on the payload — so `Team.id` was previously `undefined`
 * for every Sleeper team. That collapsed multiple Sleeper leagues into a
 * single entry wherever the dashboard keys teams by id (matchup priority,
 * score-change tracking). Hashing `league_id` keeps ids stable across
 * renders and distinct across leagues.
 */
function sleeperTeamId(leagueId: string): number {
  let hash = 0;
  for (let i = 0; i < leagueId.length; i += 1) {
    hash = (hash * 31 + leagueId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Builds teams for a Sleeper integration.
 * @param integration The sleeper integration record.
 * @param week The current NFL week.
 * @param playerResources Sleeper players data and lookup map.
 * @returns A list of teams from Sleeper.
 */
export async function buildSleeperTeams(
  integration: { id: number; provider_user_id: string },
  week: number,
  playerResources?: SleeperPlayersResources
): Promise<Team[]> {
  const { playersData } =
    playerResources ?? (await getSleeperPlayersResources());

  // Resolve leagues live from Sleeper each build: Sleeper issues a new
  // league_id every season, so the copy saved to fp_leagues at connect time
  // goes stale after a season rollover and would surface last year's rosters.
  const { leagues, error: leaguesError } = await getCurrentSleeperLeagues(
    integration.provider_user_id
  );
  if (leaguesError || !leagues) {
    return [];
  }

  const teams: Team[] = [];

  // Sleeper can list the same league_id more than once (e.g. when the user
  // manages two rosters in it), which would otherwise produce duplicate
  // scoreboards and double-count that league's players in aggregated views.
  const uniqueLeagues = Array.from(
    new Map(
      (leagues as SleeperLeague[]).map((league) => [league.league_id, league])
    ).values()
  );

  for (const league of uniqueLeagues) {
    const [rosters, matchups, leagueUsers, scoringSettingsRes, projectionsRes] =
      await Promise.all([
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`).then(
          (response) => response.json() as Promise<SleeperRoster[]>
        ),
        fetch(
          `https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`
        ).then((response) => response.json() as Promise<SleeperMatchup[]>),
        fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`).then(
          (response) => response.json() as Promise<SleeperUser[]>
        ),
        getLeagueScoringSettings(league.league_id),
        league.season
          ? getWeeklyProjections(league.season, week)
          : Promise.resolve({ projections: [] as SleeperProjection[] }),
      ]);

    if (
      !Array.isArray(rosters) ||
      !Array.isArray(matchups) ||
      !Array.isArray(leagueUsers)
    ) {
      continue;
    }

    // Projections are a nice-to-have layered on top of live scoring, so a
    // failure here (a Sleeper schema change, a transient error) should
    // degrade to "no projected points" rather than dropping the league.
    const scoringSettings = scoringSettingsRes.scoringSettings;
    const projectionsByPlayerId = new Map(
      (projectionsRes.projections ?? []).map((projection) => [
        projection.player_id,
        projection,
      ])
    );

    const userRoster = rosters.find(
      (roster) => roster.owner_id === integration.provider_user_id
    );
    if (!userRoster) continue;

    const userMatchup = matchups.find(
      (matchup) => matchup.roster_id === userRoster.roster_id
    );
    if (!userMatchup) continue;

    const opponentMatchup = matchups.find(
      (matchup) =>
        matchup.matchup_id === userMatchup.matchup_id &&
        matchup.roster_id !== userRoster.roster_id
    );

    const opponentRoster = opponentMatchup
      ? rosters.find((roster) => roster.roster_id === opponentMatchup.roster_id) || null
      : null;

    const userLeagueInfo = leagueUsers.find(
      (user) => user.user_id === integration.provider_user_id
    );
    const userName =
      userLeagueInfo?.metadata?.team_name ||
      userLeagueInfo?.display_name ||
      'My Team';

    const opponentUser = opponentRoster
      ? leagueUsers.find((user) => user.user_id === opponentRoster.owner_id) || null
      : null;
    const opponentName =
      opponentUser?.metadata?.team_name ||
      opponentUser?.display_name ||
      'Opponent';

    const userPlayers = userMatchup.players
      .map((playerId: string) =>
        mapSleeperPlayer({
          playerId,
          playersData,
          matchup: userMatchup,
          roster: userRoster,
          projection: projectionsByPlayerId.get(playerId),
          scoringSettings,
        })
      )
      .filter((player): player is Player => player !== null);

    const opponentPlayers =
      opponentMatchup && opponentMatchup.players
        ? opponentMatchup.players
            .map((playerId: string) =>
              mapSleeperPlayer({
                playerId,
                playersData,
                matchup: opponentMatchup,
                roster: opponentRoster,
                projection: projectionsByPlayerId.get(playerId),
                scoringSettings,
              })
            )
            .filter((player): player is Player => player !== null)
        : [];

    teams.push({
      id: league.id ?? sleeperTeamId(league.league_id),
      name: userName,
      league: {
        provider: 'sleeper',
        providerLeagueId: league.league_id,
        name: league.name || `Sleeper league ${league.league_id}`,
        season: league.season ?? null,
        totalRosters: league.total_rosters ?? null,
      },
      totalScore: userMatchup.points,
      players: userPlayers,
      opponent: {
        name: opponentName,
        totalScore: opponentMatchup ? opponentMatchup.points : 0,
        players: opponentPlayers,
      },
    });
  }

  return teams;
}

type BuildYahooTeamsOptions = {
  week?: number;
  accessToken?: string;
  prefetchedTeams?: any[];
};

type YahooLeagueRow = {
  league_id: string;
  name: string | null;
  season: string | null;
  total_rosters: number | null;
};

/**
 * Loads the persisted league rows for a Yahoo integration, keyed by
 * league key, so teams can be labelled with their league's name.
 *
 * Failures are non-fatal: callers fall back to the bare league key.
 *
 * @param integrationId - The Yahoo integration's id.
 * @returns A map from Yahoo league key to the stored league row.
 */
async function loadYahooLeagueLookup(
  integrationId: number,
  client?: SupabaseClient
): Promise<Map<string, YahooLeagueRow>> {
  const lookupStart = startTimer();

  try {
    const supabase = client ?? createClient();
    const { data, error } = await supabase
      .from('fp_leagues')
      .select('league_id, name, season, total_rosters')
      .eq('user_integration_id', integrationId);

    logDuration('buildYahooTeams: load league names', lookupStart, {
      integrationId,
      leagueCount: data?.length ?? 0,
      success: !error,
    });

    if (error || !data) {
      return new Map();
    }

    return new Map(
      data
        .filter((row): row is YahooLeagueRow => Boolean(row?.league_id))
        .map((row) => [row.league_id, row])
    );
  } catch (error) {
    logDuration('buildYahooTeams: load league names', lookupStart, {
      integrationId,
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

/**
 * Builds teams for a Yahoo integration.
 * @param integration The yahoo integration record.
 * @param playerNameMap Mapping of player full names to Sleeper IDs.
 * @returns A list of teams from Yahoo.
 */
export async function buildYahooTeams(
  integration: any,
  playerNameMap: { [key: string]: string },
  weekOrAccessTokenOrOptions?:
    | number
    | string
    | BuildYahooTeamsOptions
    | any[],
  accessTokenOrPrefetchedTeams?: string | any[],
  prefetchedTeamsArg?: any[],
  client?: SupabaseClient,
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Team[]> {
  let yahooApiTeams: any[] | undefined;
  let resolvedAccessToken: string | undefined;
  let week: number | undefined;

  if (typeof weekOrAccessTokenOrOptions === 'number') {
    week = weekOrAccessTokenOrOptions;
  } else if (typeof weekOrAccessTokenOrOptions === 'string') {
    resolvedAccessToken = weekOrAccessTokenOrOptions;
  } else if (Array.isArray(weekOrAccessTokenOrOptions)) {
    yahooApiTeams = weekOrAccessTokenOrOptions;
  } else if (
    weekOrAccessTokenOrOptions &&
    typeof weekOrAccessTokenOrOptions === 'object'
  ) {
    const options = weekOrAccessTokenOrOptions as BuildYahooTeamsOptions;
    week = options.week;
    resolvedAccessToken = options.accessToken ?? resolvedAccessToken;
    yahooApiTeams = options.prefetchedTeams ?? yahooApiTeams;
  }

  if (typeof accessTokenOrPrefetchedTeams === 'string') {
    resolvedAccessToken = accessTokenOrPrefetchedTeams;
  } else if (Array.isArray(accessTokenOrPrefetchedTeams)) {
    yahooApiTeams = accessTokenOrPrefetchedTeams;
  }

  if (Array.isArray(prefetchedTeamsArg)) {
    yahooApiTeams = prefetchedTeamsArg;
  }

  if (week === undefined) {
    week = await getCurrentNflWeek();
  }

  const resolvedWeek = week as number;

  if (!yahooApiTeams) {
    const {
      teams: fetchedTeams,
      error: teamsError,
      accessToken: teamsAccessToken,
    } = await getYahooUserTeams(integration.id, client, integration.user_id);

    if (teamsError || !fetchedTeams) {
      return [];
    }

    yahooApiTeams = fetchedTeams;
    if (!resolvedAccessToken) {
      resolvedAccessToken = teamsAccessToken;
    }
  }

  if (!resolvedAccessToken) {
    const { access_token: freshToken, error: accessTokenError } =
      await getYahooAccessToken(integration.id, client, integration.user_id);

    if (accessTokenError || !freshToken) {
      console.error(
        `Could not fetch Yahoo access token for integration ${integration.id}`,
        accessTokenError || 'Unknown error'
      );
      return [];
    }

    resolvedAccessToken = freshToken;
  }

  const teams: Team[] = [];
  const resolveSleeperId = createSleeperIdResolver(playerNameMap);

  // Yahoo's team payload carries only a league_key, not the league's
  // name. Names were persisted to fp_leagues at connect time, so resolve
  // them in one indexed query rather than per team.
  const leagueLookup = await loadYahooLeagueLookup(integration.id, client);

  const mapYahooPlayer = (
    player: any,
    scoresMap: Map<string, number>
  ): Player => {
    const sleeperId = resolveSleeperId(player.name);
    const imageUrl = getSleeperHeadshotUrl(sleeperId);
    const projection = sleeperId
      ? sleeperProjectionsByPlayerId?.get(sleeperId)
      : undefined;
    const projectedPoints = scoreStockProjection(projection, projectionScoringMode);

    return {
      id: player.player_key,
      name: player.name,
      position: player.display_position,
      realTeam: player.editorial_team_abbr,
      score: scoresMap.get(player.player_key) || 0,
      gameStatus: 'pregame',
      gameStartTime: null,
      gameQuarter: null,
      gameClock: null,
      onUserTeams: 0,
      onOpponentTeams: 0,
      gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
      imageUrl: imageUrl,
      onBench: player.onBench,
      ...(projectedPoints !== null ? { projectedPoints } : {}),
    };
  };

  const buildTeam = async (team: any): Promise<Team | null> => {
    const userPlayerScoresPromise = getYahooPlayerScores(
      integration.id,
      team.team_key,
      resolvedAccessToken,
      resolvedWeek
    );

    const { matchups, error: matchupsError } = await getYahooMatchups(
      integration.id,
      team.team_key,
      resolvedAccessToken,
      resolvedWeek
    );

    if (matchupsError || !matchups) {
      await Promise.allSettled([userPlayerScoresPromise]);
      return null;
    }

    const { userTeam, opponentTeam } = matchups;

    const [
      { players: userPlayers, error: userRosterError },
      { players: opponentPlayers, error: opponentRosterError },
    ] = await Promise.all([
      getYahooRoster(
        integration.id,
        team.league_id,
        userTeam.team_id,
        resolvedAccessToken
      ),
      getYahooRoster(
        integration.id,
        team.league_id,
        opponentTeam.team_id,
        resolvedAccessToken
      ),
    ]);

    if (
      userRosterError ||
      !userPlayers ||
      opponentRosterError ||
      !opponentPlayers
    ) {
      return null;
    }

    const opponentPlayerScoresPromise = getYahooPlayerScores(
      integration.id,
      opponentTeam.team_key,
      resolvedAccessToken,
      resolvedWeek
    );

    const [userScoresResult, opponentScoresResult] = await Promise.allSettled([
      userPlayerScoresPromise,
      opponentPlayerScoresPromise,
    ]);

    let userPlayerScores: any[] | null | undefined;
    if (userScoresResult.status === 'fulfilled') {
      userPlayerScores = userScoresResult.value.players;
      if (userScoresResult.value.error) {
        console.error(
          `Could not fetch user player scores for team ${userTeam.team_key}`,
          userScoresResult.value.error
        );
      }
    } else {
      console.error(
        `Could not fetch user player scores for team ${userTeam.team_key}`,
        userScoresResult.reason || 'Unknown error'
      );
    }

    let opponentPlayerScores: any[] | null | undefined;
    if (opponentScoresResult.status === 'fulfilled') {
      opponentPlayerScores = opponentScoresResult.value.players;
      if (opponentScoresResult.value.error) {
        console.error(
          `Could not fetch opponent player scores for team ${opponentTeam.team_key}`,
          opponentScoresResult.value.error
        );
      }
    } else {
      console.error(
        `Could not fetch opponent player scores for team ${opponentTeam.team_key}`,
        opponentScoresResult.reason || 'Unknown error'
      );
    }

    const userScoresMap = new Map(
      (userPlayerScores ?? []).map((p: any) => [
        p.player_key,
        Number(p.totalPoints ?? 0),
      ])
    );
    const opponentScoresMap = new Map(
      (opponentPlayerScores ?? []).map((p: any) => [
        p.player_key,
        Number(p.totalPoints ?? 0),
      ])
    );

    const mappedUserPlayers: Player[] = userPlayers.map((p: any) =>
      mapYahooPlayer(p, userScoresMap)
    );
    const mappedOpponentPlayers: Player[] = opponentPlayers.map((p: any) =>
      mapYahooPlayer(p, opponentScoresMap)
    );

    const leagueRow = team.league_id ? leagueLookup.get(team.league_id) : undefined;

    return {
      id: team.id,
      name: userTeam.name,
      league: {
        provider: 'yahoo',
        providerLeagueId: team.league_id ?? '',
        name: leagueRow?.name || `Yahoo league ${team.league_id ?? 'unknown'}`,
        season: leagueRow?.season ?? null,
        totalRosters: leagueRow?.total_rosters ?? null,
      },
      totalScore: parseFloat(userTeam.totalPoints) || 0,
      players: mappedUserPlayers,
      opponent: {
        name: opponentTeam.name,
        totalScore: parseFloat(opponentTeam.totalPoints) || 0,
        players: mappedOpponentPlayers,
      },
    };
  };

  const builtTeams = await Promise.all(
    (yahooApiTeams ?? []).map((team: any) => buildTeam(team))
  );
  const successfulTeams = builtTeams.filter(
    (team): team is Team => Boolean(team)
  );

  teams.push(...successfulTeams);

  return teams;
}

/**
 * Fetches a team's full roster from its Ottoneu team page. Unlike the
 * matchup/game page, this table exists year-round (preseason, offseason,
 * bye weeks), so it's used whenever there's no active matchup to scrape.
 */
async function fetchOttoneuRosterPlayers(
  teamUrl: string,
  resolveSleeperId: SleeperIdResolver,
  playersData: Record<string, SleeperPlayer>,
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Player[]> {
  const res = await fetch(teamUrl);
  if (!res.ok) {
    return [];
  }

  const html = await res.text();
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const rosterTable = Array.from(document.querySelectorAll('table')).find(
    (table) => {
      const headerTexts = Array.from(table.querySelectorAll('thead th'))
        .map((th) => th.textContent?.trim().toLowerCase())
        .filter(Boolean) as string[];
      return headerTexts.includes('player') && headerTexts.includes('pos');
    }
  );

  if (!rosterTable) {
    return [];
  }

  const rows = Array.from(rosterTable.querySelectorAll('tbody tr'));

  return rows
    .map((row): Player | null => {
      const playerCell = row.querySelector('td');
      const anchor = playerCell?.querySelector('a[href*="/player_card/"]');
      const name = anchor?.textContent?.trim() || '';
      if (!name) {
        return null;
      }

      const idMatch = (anchor?.getAttribute('href') || '').match(
        /\/player_card\/nfl\/(\d+)/
      );
      const id = idMatch ? idMatch[1] : name;

      const meta =
        playerCell?.querySelector('.smaller')?.textContent?.trim() || '';
      const metaParts = meta.split(' ').filter(Boolean);
      const realTeam = metaParts[0] || '';
      const metaPosition = metaParts.slice(1).join(' ');

      const posCell = row.querySelectorAll('td')[1];
      const posDisplay = posCell?.textContent?.trim() || '';

      const sleeperId = resolveSleeperId(name);
      const sleeperPosition = sleeperId
        ? playersData[sleeperId]?.position
        : undefined;
      const position =
        (sleeperPosition || '').toString().toUpperCase() ||
        (metaPosition ? metaPosition.toUpperCase() : '') ||
        posDisplay.toUpperCase() ||
        '';
      const projection = sleeperId
        ? sleeperProjectionsByPlayerId?.get(sleeperId)
        : undefined;
      const projectedPoints = scoreStockProjection(projection, projectionScoringMode);

      return {
        id,
        name,
        position,
        realTeam,
        score: 0,
        gameStatus: 'pregame',
        gameStartTime: null,
        gameQuarter: null,
        gameClock: null,
        onUserTeams: 0,
        onOpponentTeams: 0,
        gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
        imageUrl: getSleeperHeadshotUrl(sleeperId),
        onBench: false,
        ...(projectedPoints !== null ? { projectedPoints } : {}),
      } satisfies Player;
    })
    .filter((player): player is Player => player !== null);
}

/**
 * Builds teams for an Ottoneu integration.
 * @param integration The Ottoneu integration record.
 * @returns A list of teams from Ottoneu.
 */
export async function buildOttoneuTeams(
  integration: any,
  playerNameMap: { [key: string]: string },
  playersData: Record<string, SleeperPlayer>,
  client?: SupabaseClient,
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Team[]> {
  const { leagues, error } = await getOttoneuLeagues(integration.id, client);
  if (error || !leagues || leagues.length === 0) {
    return [];
  }

  const league = leagues[0];
  const info = await getOttoneuTeamInfo(
    `https://ottoneu.fangraphs.com/football/${league.league_id}/team/${integration.provider_user_id}`
  );

  if ('error' in info) {
    return [];
  }
  const teamId = parseInt(info.teamId, 10);

  let userPlayers: Player[] = [];
  let opponentPlayers: Player[] = [];
  const resolveSleeperId = createSleeperIdResolver(playerNameMap);

  const normalizedTeamName = normalizeOttoneuTeamName(info.teamName);

  if (info.matchup?.url) {
    try {
      const res = await fetch(`https://ottoneu.fangraphs.com${info.matchup.url}`);
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const getDetailsName = (details: Element | null) => {
          if (!details) {
            return '';
          }

          const anchorText = details.querySelector('a')?.textContent;
          if (anchorText) {
            return anchorText;
          }

          return details.textContent || '';
        };

        let isHome = false;
        let sideDetermined = false;

        const teamScores = document.querySelector('.team-scores');
        if (teamScores) {
          const homeDetails = teamScores.querySelector('.home-team-details');
          const awayDetails = teamScores.querySelector('.away-team-details');
          const normalizedHome = normalizeOttoneuTeamName(
            getDetailsName(homeDetails)
          );
          const normalizedAway = normalizeOttoneuTeamName(
            getDetailsName(awayDetails)
          );

          if (normalizedHome && normalizedHome === normalizedTeamName) {
            isHome = true;
            sideDetermined = true;
          } else if (normalizedAway && normalizedAway === normalizedTeamName) {
            isHome = false;
            sideDetermined = true;
          }
        }

        if (!sideDetermined) {
          const homeName = normalizeOttoneuTeamName(
            document.querySelector('.game-page-home-team-name')?.textContent || ''
          );
          const awayName = normalizeOttoneuTeamName(
            document.querySelector('.game-page-away-team-name')?.textContent || ''
          );

          if (homeName && homeName === normalizedTeamName) {
            isHome = true;
            sideDetermined = true;
          } else if (awayName && awayName === normalizedTeamName) {
            isHome = false;
            sideDetermined = true;
          }
        }

        const rows = Array.from(
          document.querySelectorAll('.game-details-table tbody tr')
        );

        const parsePlayer = (
          cell: Element,
          pointsCell: Element,
          positionCell: Element
        ): Player => {
          const id = cell.getAttribute('data-player-id') || '';
          const name =
            cell.querySelector('a')?.textContent?.trim() || '';
          const meta =
            cell.querySelector('.smaller')?.textContent?.trim() || '';
          const metaParts = meta.split(' ').filter(Boolean);
          const realTeam = metaParts[0] || '';
          const metaPosition = metaParts.slice(1).join(' ');
          const score = parseFloat(pointsCell.textContent?.trim() || '0') || 0;
          const posDisplay = positionCell.textContent?.trim() || '';
          const rosterSpot = (cell.getAttribute('data-position') || '').trim();
          const onBench =
            posDisplay === 'BN' ||
            rosterSpot.toLowerCase() === 'bench';
          const sleeperId = resolveSleeperId(name);
          const sleeperPosition = sleeperId
            ? playersData[sleeperId]?.position
            : undefined;
          const projection = sleeperId
            ? sleeperProjectionsByPlayerId?.get(sleeperId)
            : undefined;
          const projectedPoints = scoreStockProjection(projection, projectionScoringMode);
          const sanitizedRosterSpot = rosterSpot
            .toUpperCase()
            .replace(/\s+/g, '');
          const sanitizedDisplay = posDisplay.toUpperCase();
          const fallbackRosterSpot = IGNORED_ROSTER_SPOTS.has(
            sanitizedRosterSpot
          )
            ? ''
            : rosterSpot;
          const fallbackDisplaySpot = IGNORED_ROSTER_SPOTS.has(
            sanitizedDisplay
          )
            ? ''
            : posDisplay;
          const position =
            (sleeperPosition || '').toString().toUpperCase() ||
            (metaPosition ? metaPosition.toUpperCase() : '') ||
            fallbackRosterSpot.toUpperCase() ||
            fallbackDisplaySpot.toUpperCase() ||
            '';

          return {
            id,
            name,
            position,
            realTeam,
            score,
            gameStatus: 'pregame',
            gameStartTime: null,
            gameQuarter: null,
            gameClock: null,
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: getSleeperHeadshotUrl(sleeperId),
            onBench: onBench,
            ...(projectedPoints !== null ? { projectedPoints } : {}),
          };
        };

        rows.forEach((row) => {
          const positionCell = row.querySelector('.game-details-position') as Element | null;
          const homeCell = row.querySelector(
            '.home-team-position-player'
          ) as Element | null;
          const homePoints = row.querySelector(
            '.game-page-home-team-text.game-page-points'
          ) as Element | null;
          const awayCell = row.querySelector(
            '.away-team-position-player'
          ) as Element | null;
          const awayPoints = row.querySelector(
            '.game-page-away-team-text.game-page-points'
          ) as Element | null;

          if (homeCell && homePoints && positionCell) {
            const player = parsePlayer(homeCell, homePoints, positionCell);
            if (isHome) {
              userPlayers.push(player);
            } else {
              opponentPlayers.push(player);
            }
          }

          if (awayCell && awayPoints && positionCell) {
            const player = parsePlayer(awayCell, awayPoints, positionCell);
            if (isHome) {
              opponentPlayers.push(player);
            } else {
              userPlayers.push(player);
            }
          }
        });
      }
    } catch (e) {
      console.error('Failed to fetch Ottoneu matchup page', e);
    }
  } else {
    try {
      userPlayers = await fetchOttoneuRosterPlayers(
        `https://ottoneu.fangraphs.com/football/${league.league_id}/team/${integration.provider_user_id}`,
        resolveSleeperId,
        playersData,
        sleeperProjectionsByPlayerId,
        projectionScoringMode
      );
    } catch (e) {
      console.error('Failed to fetch Ottoneu roster page', e);
    }
  }

  return [
    {
      id: Number.isNaN(teamId) ? 0 : teamId,
      name: info.teamName,
      league: {
        provider: 'ottoneu',
        providerLeagueId: String(league.league_id),
        name: league.name || `Ottoneu league ${league.league_id}`,
        season: league.season ?? null,
        totalRosters: league.total_rosters ?? null,
      },
      totalScore: info.matchup?.teamScore ?? 0,
      players: userPlayers,
      opponent: {
        name: info.matchup?.opponentName ?? 'Opponent',
        totalScore: info.matchup?.opponentScore ?? 0,
        players: opponentPlayers,
      },
    },
  ];
}

/**
 * Builds teams for an ESPN integration.
 * @param integration The ESPN integration record.
 * @param playerNameMap Sleeper name lookup, used to resolve headshots.
 * @returns A list of teams from ESPN.
 */
export async function buildEspnTeams(
  integration: any,
  playerNameMap: { [key: string]: string },
  sleeperProjectionsByPlayerId?: Map<string, SleeperProjection>,
  projectionScoringMode: SleeperStockScoringMode = DEFAULT_NON_SLEEPER_PROJECTION_SCORING
): Promise<Team[]> {
  const [{ teams: espnTeamRows, error: teamsError }, { leagues: espnLeagueRows }] =
    await Promise.all([
      getEspnTeamRows(integration.id),
      getEspnLeagues(integration.id),
    ]);

  if (teamsError || !espnTeamRows?.length) {
    return [];
  }

  const leagueLookup = new Map(
    (espnLeagueRows ?? []).map((league: any) => [league.league_id, league])
  );
  const resolveSleeperId = createSleeperIdResolver(playerNameMap);

  const mapEspnPlayer = (p: EspnRosterPlayer): Player => {
    const sleeperId = resolveSleeperId(p.name);
    const projection = sleeperId
      ? sleeperProjectionsByPlayerId?.get(sleeperId)
      : undefined;
    const projectedPoints = scoreStockProjection(projection, projectionScoringMode);
    return {
      id: p.id || p.name,
      name: p.name,
      position: p.position,
      realTeam: p.realTeam,
      score: p.points,
      gameStatus: 'pregame',
      gameStartTime: null,
      gameQuarter: null,
      gameClock: null,
      onUserTeams: 0,
      onOpponentTeams: 0,
      gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
      imageUrl: getSleeperHeadshotUrl(sleeperId),
      onBench: p.onBench,
      ...(projectedPoints !== null ? { projectedPoints } : {}),
    };
  };

  const builtTeams = await Promise.all(
    espnTeamRows.map(async (row: any): Promise<Team | null> => {
      const { matchup, error } = await getEspnMatchup(
        integration.id,
        row.league_id,
        row.team_id
      );

      if (error || !matchup) {
        return null;
      }

      const leagueRow = leagueLookup.get(row.league_id);

      return {
        id: row.id,
        name: matchup.userTeam.name || row.name,
        league: {
          provider: 'espn',
          providerLeagueId: row.league_id,
          name: leagueRow?.name || `ESPN League ${row.league_id}`,
          season: leagueRow?.season ?? null,
          totalRosters: leagueRow?.total_rosters ?? null,
        },
        totalScore: matchup.userTeam.totalPoints ?? 0,
        players: (matchup.userTeam.players ?? []).map(mapEspnPlayer),
        opponent: {
          name: matchup.opponentTeam.name || 'Opponent',
          totalScore: matchup.opponentTeam.totalPoints ?? 0,
          players: (matchup.opponentTeam.players ?? []).map(mapEspnPlayer),
        },
      };
    })
  );

  return builtTeams.filter((team): team is Team => Boolean(team));
}

const teamBuilders = {
  buildSleeperTeams,
  buildYahooTeams,
  buildOttoneuTeams,
  buildEspnTeams,
};

export async function getTeamBuilders() {
  return teamBuilders;
}

/**
 * Gets the user's teams from all integrated platforms.
 * @returns A list of teams.
 */
export async function getTeams(
  client?: SupabaseClient,
  userId?: string,
  options?: { demo?: boolean }
) {
  const overallStart = startTimer();
  logEvent('getTeams invoked');

  const supabase = client ?? createClient();

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const userStart = startTimer();
    const { data: { user } } = await supabase.auth.getUser();
    logDuration('getTeams: fetch user', userStart, { hasUser: Boolean(user) });
    if (!user) {
      logDuration('getTeams total', overallStart, { result: 'no-user' });
      return { error: 'You must be logged in.' };
    }
    resolvedUserId = user.id;
  }

  // Demo mode: return deterministic, self-updating fake data instead of
  // hitting any provider. Placed after auth so the login gate still
  // applies (log in as the test account); no integrations required.
  const demo = options?.demo ?? isDemoModeEnv();
  if (demo) {
    const teams = generateDemoTeams(Date.now());
    logDuration('getTeams total', overallStart, {
      result: 'demo',
      teamCount: teams.length,
    });
    return { teams };
  }

  const integrationsStart = startTimer();
  const { data: integrations, error: integrationsError } = await supabase
    .from('fp_user_integrations')
    .select('*')
    .eq('user_id', resolvedUserId);
  logDuration('getTeams: load integrations', integrationsStart, {
    integrationCount: integrations?.length ?? 0,
  });

  if (integrationsError) {
    logDuration('getTeams total', overallStart, {
      result: 'integrations-error',
      message: integrationsError.message,
    });
    return { error: integrationsError.message };
  }

  const weekStart = startTimer();
  const week = await getCurrentNflWeek();
  logDuration('getTeams: resolve current NFL week', weekStart, { week });

  const scoreboardPromise = (async () => {
    const scoreboardStart = startTimer();
    try {
      const fetchStart = startTimer();
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2`,
        { cache: 'no-store' }
      );
      logDuration('getTeams: fetch NFL scoreboard', fetchStart, {
        status: response.status,
        ok: response.ok,
        week,
      });

      if (!response.ok) {
        throw new Error(`Scoreboard request failed with status ${response.status}`);
      }

      const parseStart = startTimer();
      const data = await response.json();
      logDuration('getTeams: parse NFL scoreboard response', parseStart, {
        eventCount: Array.isArray(data?.events) ? data.events.length : undefined,
        week,
      });
      logDuration('getTeams: NFL scoreboard pipeline', scoreboardStart, {
        success: true,
        week,
      });
      return data;
    } catch (error) {
      logDuration('getTeams: NFL scoreboard pipeline', scoreboardStart, {
        success: false,
        week,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      console.error('Failed to fetch NFL scoreboard', error);
      return null;
    }
  })();

  const sleeperPlayerResources = await getSleeperPlayersResources();
  const { playersData, playerNameMap } = sleeperPlayerResources;

  // Fetched once and shared across every non-Sleeper integration: unlike
  // Sleeper leagues (scored against their own real scoring_settings in
  // buildSleeperTeams), Yahoo/Ottoneu/ESPN players are matched to this by
  // name and scored with a stock Sleeper profile — see
  // DEFAULT_NON_SLEEPER_PROJECTION_SCORING.
  const sleeperProjectionsByPlayerId = new Map<string, SleeperProjection>();
  const projectionsStart = startTimer();
  try {
    const { state: nflState } = await getNflState();
    if (nflState?.season) {
      const { projections } = await getWeeklyProjections(nflState.season, week);
      for (const projection of projections ?? []) {
        sleeperProjectionsByPlayerId.set(projection.player_id, projection);
      }
    }
    logDuration('getTeams: load shared Sleeper projections', projectionsStart, {
      projectionCount: sleeperProjectionsByPlayerId.size,
    });
  } catch (error) {
    logDuration('getTeams: load shared Sleeper projections', projectionsStart, {
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const integrationPromises = integrations.map((integration) => {
    const integrationStart = startTimer();
    const provider = integration?.provider ?? 'unknown';
    const integrationId = integration?.id;

    let builderPromise: Promise<Team[]> | null = null;

    if (integration.provider === 'sleeper') {
      builderPromise = teamBuilders.buildSleeperTeams(
        integration,
        week,
        sleeperPlayerResources
      );
    } else if (integration.provider === 'yahoo') {
      builderPromise = (async () => {
        const {
          teams: yahooTeams,
          error: yahooTeamsError,
          accessToken,
        } = await getYahooUserTeams(integration.id, supabase, integration.user_id);

        if (yahooTeamsError || !yahooTeams) {
          return [] as Team[];
        }

        return teamBuilders.buildYahooTeams(
          integration,
          playerNameMap,
          week,
          accessToken,
          yahooTeams,
          supabase,
          sleeperProjectionsByPlayerId
        );
      })();
    } else if (integration.provider === 'ottoneu') {
      builderPromise = teamBuilders.buildOttoneuTeams(
        integration,
        playerNameMap,
        playersData,
        supabase,
        sleeperProjectionsByPlayerId
      );
    } else if (integration.provider === 'espn') {
      builderPromise = teamBuilders.buildEspnTeams(
        integration,
        playerNameMap,
        sleeperProjectionsByPlayerId
      );
    }

    if (!builderPromise) {
      logDuration('getTeams: skipped integration', integrationStart, {
        provider,
        integrationId,
      });
      return Promise.resolve([] as Team[]);
    }

    return builderPromise
      .then((teams) => {
        logDuration('getTeams: build teams', integrationStart, {
          provider,
          teamCount: teams.length,
          integrationId,
        });
        return teams;
      })
      .catch((error) => {
        logDuration('getTeams: build teams', integrationStart, {
          provider,
          error: error instanceof Error ? error.message : String(error),
          integrationId,
        });
        console.error('Failed to build teams', error);
        return [] as Team[];
      });
  });

  const results = await Promise.all(integrationPromises);

  const flattenStart = startTimer();
  const teams = results.flat();
  logDuration('getTeams: flatten integration results', flattenStart, {
    teamCount: teams.length,
    integrationCount: integrations?.length ?? 0,
  });

  const scoreboardAwaitStart = startTimer();
  const scoreboardData = await scoreboardPromise;
  logDuration('getTeams: await scoreboard data', scoreboardAwaitStart, {
    hasData: Boolean(scoreboardData),
    week,
  });

  const gameInfoBuildStart = startTimer();
  const gameInfoMap = buildTeamGameInfoMap(scoreboardData);
  logDuration('getTeams: build team game info map', gameInfoBuildStart, {
    trackedTeams: gameInfoMap.size,
  });

  const annotatePlayersWithGameInfo = (players: Player[]): Player[] => {
    return players.map((player) => {
      const teamAbbr = (player.realTeam || '').toUpperCase();
      if (!teamAbbr) {
        return {
          ...player,
          gameStartTime: player.gameStartTime ?? null,
          gameQuarter: player.gameQuarter ?? null,
          gameClock: player.gameClock ?? null,
        };
      }

      const gameInfo = gameInfoMap.get(teamAbbr);
      if (!gameInfo) {
        return {
          ...player,
          gameStartTime: player.gameStartTime ?? null,
          gameQuarter: player.gameQuarter ?? null,
          gameClock: player.gameClock ?? null,
        };
      }

      return {
        ...player,
        gameStatus: gameInfo.status,
        gameStartTime: gameInfo.startDate,
        gameQuarter: gameInfo.quarter,
        gameClock: gameInfo.clock,
      };
    });
  };

  const annotateStart = startTimer();
  const teamsWithGameInfo = teams.map((team) => ({
    ...team,
    players: annotatePlayersWithGameInfo(team.players),
    opponent: {
      ...team.opponent,
      players: annotatePlayersWithGameInfo(team.opponent.players),
    },
  }));

  logDuration('getTeams: annotate teams with game info', annotateStart, {
    teamCount: teamsWithGameInfo.length,
    hasScoreboardData: Boolean(scoreboardData),
  });
  logDuration('getTeams total', overallStart, {
    teamCount: teamsWithGameInfo.length,
    integrationCount: integrations?.length ?? 0,
    hasScoreboardData: Boolean(scoreboardData),
  });

  return { teams: teamsWithGameInfo };
}
