'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getLeagues as getSleeperLeagues } from '@/app/integrations/sleeper/actions';
import {
  getYahooUserTeams,
  getYahooRoster,
  getYahooMatchups,
  getYahooPlayerScores,
} from '@/app/integrations/yahoo/actions';
import {
  getLeagues as getOttoneuLeagues,
  getOttoneuTeamInfo,
} from '@/app/integrations/ottoneu/actions';
import { mapSleeperPlayer } from '@/lib/sleeper';
import {
  Team,
  Player,
  SleeperLeague,
  SleeperRoster,
  SleeperMatchup,
  SleeperUser,
  SleeperPlayer,
} from '@/lib/types';
import { findBestMatch } from 'string-similarity';
import { JSDOM } from 'jsdom';

const SLEEPER_HEADSHOT_BASE_URL =
  'https://sleepercdn.com/content/nfl/players/thumb';
const SLEEPER_DEFAULT_HEADSHOT_URL =
  'https://sleepercdn.com/images/v2/icons/player_default.webp';

const IGNORED_ROSTER_SPOTS = new Set(['BN', 'BENCH', 'FLX', 'SFLX']);

type SleeperIdResolver = (playerName: string) => string | null;

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

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

/**
 * Builds teams for a Sleeper integration.
 * @param integration The sleeper integration record.
 * @param week The current NFL week.
 * @param playersData Sleeper players data.
 * @returns A list of teams from Sleeper.
 */
export async function buildSleeperTeams(
  integration: { id: number; provider_user_id: string },
  week: number,
  playersData: Record<string, SleeperPlayer>
): Promise<Team[]> {
  const { leagues, error: leaguesError } = await getSleeperLeagues(integration.id);
  if (leaguesError || !leagues) {
    return [];
  }

  const teams: Team[] = [];

  for (const league of leagues as SleeperLeague[]) {
    const [rosters, matchups, leagueUsers] = await Promise.all([
      fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`).then(
        (response) => response.json() as Promise<SleeperRoster[]>
      ),
      fetch(
        `https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`
      ).then((response) => response.json() as Promise<SleeperMatchup[]>),
      fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`).then(
        (response) => response.json() as Promise<SleeperUser[]>
      ),
    ]);

    if (
      !Array.isArray(rosters) ||
      !Array.isArray(matchups) ||
      !Array.isArray(leagueUsers)
    ) {
      continue;
    }

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
              })
            )
            .filter((player): player is Player => player !== null)
        : [];

    teams.push({
      id: league.id,
      name: userName,
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

/**
 * Builds teams for a Yahoo integration.
 * @param integration The yahoo integration record.
 * @param playerNameMap Mapping of player full names to Sleeper IDs.
 * @returns A list of teams from Yahoo.
 */
export async function buildYahooTeams(
  integration: any,
  playerNameMap: { [key: string]: string }
): Promise<Team[]> {
  const { teams: yahooApiTeams, error: teamsError } = await getYahooUserTeams(
    integration.id
  );
  if (teamsError || !yahooApiTeams) {
    return [];
  }

  const teams: Team[] = [];
  const resolveSleeperId = createSleeperIdResolver(playerNameMap);

  for (const team of yahooApiTeams) {
    const { matchups, error: matchupsError } = await getYahooMatchups(
      integration.id,
      team.team_key
    );
    if (matchupsError || !matchups) {
      continue;
    }

    const { userTeam, opponentTeam } = matchups;

    const [
      { players: userPlayers, error: userRosterError },
      { players: opponentPlayers, error: opponentRosterError },
    ] = await Promise.all([
      getYahooRoster(integration.id, team.league_id, userTeam.team_id),
      getYahooRoster(integration.id, team.league_id, opponentTeam.team_id),
    ]);

    if (
      userRosterError ||
      !userPlayers ||
      opponentRosterError ||
      !opponentPlayers
    ) {
      continue;
    }

    const [userScoresResult, opponentScoresResult] = await Promise.allSettled([
      getYahooPlayerScores(integration.id, userTeam.team_key),
      getYahooPlayerScores(integration.id, opponentTeam.team_key),
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
      (userPlayerScores ?? []).map((p: any) => [p.player_key, Number(p.totalPoints ?? 0)])
    );
    const opponentScoresMap = new Map(
      (opponentPlayerScores ?? []).map((p: any) => [p.player_key, Number(p.totalPoints ?? 0)])
    );

    const mapYahooPlayer = (
      p: any,
      scoresMap: Map<string, number>
    ): Player => {
      const sleeperId = resolveSleeperId(p.name);
      const imageUrl = getSleeperHeadshotUrl(sleeperId);

      return {
        id: p.player_key,
        name: p.name,
        position: p.display_position,
        realTeam: p.editorial_team_abbr,
        score: scoresMap.get(p.player_key) || 0,
        gameStatus: 'pregame',
        onUserTeams: 0,
        onOpponentTeams: 0,
        gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
        imageUrl: imageUrl,
        onBench: p.onBench,
      };
    };

    const mappedUserPlayers: Player[] = userPlayers.map((p: any) =>
      mapYahooPlayer(p, userScoresMap)
    );
    const mappedOpponentPlayers: Player[] = opponentPlayers.map((p: any) =>
      mapYahooPlayer(p, opponentScoresMap)
    );

    teams.push({
      id: team.id,
      name: userTeam.name,
      totalScore: parseFloat(userTeam.totalPoints) || 0,
      players: mappedUserPlayers,
      opponent: {
        name: opponentTeam.name,
        totalScore: parseFloat(opponentTeam.totalPoints) || 0,
        players: mappedOpponentPlayers,
      },
    });
  }

  return teams;
}

/**
 * Builds teams for an Ottoneu integration.
 * @param integration The Ottoneu integration record.
 * @returns A list of teams from Ottoneu.
 */
export async function buildOttoneuTeams(
  integration: any,
  playerNameMap: { [key: string]: string },
  playersData: Record<string, SleeperPlayer>
): Promise<Team[]> {
  const { leagues, error } = await getOttoneuLeagues(integration.id);
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
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: getSleeperHeadshotUrl(sleeperId),
            onBench: onBench,
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
  }

  return [
    {
      id: Number.isNaN(teamId) ? 0 : teamId,
      name: info.teamName,
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

const teamBuilders = {
  buildSleeperTeams,
  buildYahooTeams,
  buildOttoneuTeams,
};

export async function getTeamBuilders() {
  return teamBuilders;
}

/**
 * Gets the user's teams from all integrated platforms.
 * @returns A list of teams.
 */
export async function getTeams() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id);

  if (integrationsError) {
    return { error: integrationsError.message };
  }

  const week = await getCurrentNflWeek();
  const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
  const playersData = await playersResponse.json();

  const playerNameMap: { [key: string]: string } = {};
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

  for (const playerId in playersData) {
    const player = playersData[playerId];
    addPlayerName(player.full_name ?? null, playerId);

    const combinedName = [player.first_name, player.last_name]
      .filter((part) => part && part.trim())
      .join(' ');
    addPlayerName(combinedName || null, playerId);
  }

  const integrationPromises = integrations.map((integration) => {
    if (integration.provider === 'sleeper') {
      return teamBuilders.buildSleeperTeams(integration, week, playersData);
    } else if (integration.provider === 'yahoo') {
      return teamBuilders.buildYahooTeams(integration, playerNameMap);
    } else if (integration.provider === 'ottoneu') {
      return teamBuilders.buildOttoneuTeams(
        integration,
        playerNameMap,
        playersData
      );
    }
    return Promise.resolve([]);
  });

  const results = await Promise.all(
    integrationPromises.map((p) =>
      p.catch((error) => {
        console.error('Failed to build teams', error);
        return [] as Team[];
      })
    )
  );

  const teams = results.flat();

  return { teams };
}
