'use server';

/**
 * Turns a user's Yahoo teams into `Team[]`.
 *
 * Yahoo gives names rather than stable player ids, so every player is
 * reconciled against the Sleeper master list by name before projections
 * and headshots can be attached.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Team,
  Player,
  SleeperProjection,
  SleeperStockScoringMode,
  scoreStockProjection,
} from '@roster-loom/core';
import { createClient } from '@/utils/supabase/server';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { getCurrentNflWeek } from '@/lib/nfl/week';
import { DEFAULT_NON_SLEEPER_PROJECTION_SCORING } from '@/lib/nfl/projections';
import {
  createSleeperIdResolver,
  getSleeperHeadshotUrl,
} from '@/lib/nfl/player-matching';
import {
  getYahooUserTeams,
  getYahooRoster,
  getYahooMatchups,
  getYahooPlayerScores,
  getYahooAccessToken,
} from './actions';

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
