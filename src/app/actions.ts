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
import { Team, Player } from '@/lib/types';
import { findBestMatch } from 'string-similarity';
import { JSDOM } from 'jsdom';

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
  integration: any,
  week: number,
  playersData: any
): Promise<Team[]> {
  const { leagues, error: leaguesError } = await getSleeperLeagues(integration.id);
  if (leaguesError || !leagues) {
    return [];
  }

  const teams: Team[] = [];

  for (const league of leagues) {
    const rostersResponse = await fetch(
      `https://api.sleeper.app/v1/league/${league.league_id}/rosters`
    );
    const rosters = await rostersResponse.json();

    const matchupsResponse = await fetch(
      `https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`
    );
    const matchups = await matchupsResponse.json();

    const userRoster = rosters.find(
      (roster: any) => roster.owner_id === integration.provider_user_id
    );
    if (!userRoster) continue;

    const userMatchup = matchups.find(
      (matchup: any) => matchup.roster_id === userRoster.roster_id
    );
    if (!userMatchup) continue;

    const opponentMatchup = matchups.find(
      (matchup: any) =>
        matchup.matchup_id === userMatchup.matchup_id &&
        matchup.roster_id !== userRoster.roster_id
    );

    const opponentRoster = opponentMatchup
      ? rosters.find((roster: any) => roster.roster_id === opponentMatchup.roster_id)
      : null;

    const leagueUsersResponse = await fetch(
      `https://api.sleeper.app/v1/league/${league.league_id}/users`
    );
    const leagueUsers = await leagueUsersResponse.json();

    const userLeagueInfo = leagueUsers.find(
      (user: any) => user.user_id === integration.provider_user_id
    );
    const userName =
      userLeagueInfo?.metadata?.team_name ||
      userLeagueInfo?.display_name ||
      'My Team';

    const opponentUser = opponentRoster
      ? leagueUsers.find((user: any) => user.user_id === opponentRoster.owner_id)
      : null;
    const opponentName =
      opponentUser?.metadata?.team_name ||
      opponentUser?.display_name ||
      'Opponent';

    const userPlayers = userMatchup.players.map((playerId: string) => {
      const player = playersData[playerId];
      const score = userMatchup.players_points?.[playerId] ?? 0;
      return {
        id: playerId,
        name: player.full_name,
        position: player.position,
        realTeam: player.team,
        score: score,
        gameStatus: 'pregame',
        onUserTeams: 0,
        onOpponentTeams: 0,
        gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
        imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
        on_bench: !userRoster.starters.includes(playerId),
      };
    });

    const opponentPlayers =
      opponentMatchup && opponentMatchup.players
        ? opponentMatchup.players.map((playerId: string) => {
            const player = playersData[playerId];
            const score = opponentMatchup.players_points?.[playerId] ?? 0;

            return {
              id: playerId,
              name: player.full_name,
              position: player.position,
              realTeam: player.team,
              score: score,
              gameStatus: 'pregame',
              onUserTeams: 0,
              onOpponentTeams: 0,
              gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
              imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
              on_bench: !opponentRoster.starters.includes(playerId),
            };
          })
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

  for (const team of yahooApiTeams) {
    const { matchups, error: matchupsError } = await getYahooMatchups(
      integration.id,
      team.team_key
    );
    if (matchupsError || !matchups) {
      continue;
    }

    const { userTeam, opponentTeam } = matchups;

    const { players: userPlayers, error: userRosterError } = await getYahooRoster(
      integration.id,
      team.league_id,
      userTeam.team_id
    );
    if (userRosterError || !userPlayers) continue;

    const { players: opponentPlayers, error: opponentRosterError } = await getYahooRoster(
      integration.id,
      team.league_id,
      opponentTeam.team_id
    );
    if (opponentRosterError || !opponentPlayers) continue;

    const { players: userPlayerScores, error: userScoresError } =
      await getYahooPlayerScores(integration.id, userTeam.team_key);
    if (userScoresError) {
      console.error(
        `Could not fetch user player scores for team ${userTeam.team_key}`,
        userScoresError
      );
    }

    const { players: opponentPlayerScores, error: opponentScoresError } =
      await getYahooPlayerScores(integration.id, opponentTeam.team_key);
    if (opponentScoresError) {
      console.error(
        `Could not fetch opponent player scores for team ${opponentTeam.team_key}`,
        opponentScoresError
      );
    }

    const userScoresMap = new Map(
      userPlayerScores?.map((p: any) => [p.player_key, Number(p.totalPoints ?? 0)])
    );
    const opponentScoresMap = new Map(
      opponentPlayerScores?.map((p: any) => [p.player_key, Number(p.totalPoints ?? 0)])
    );

    const mapYahooPlayer = (
      p: any,
      scoresMap: Map<string, number>
    ): Player => {
      const bestMatch = findBestMatch(
        p.name.toLowerCase(),
        Object.keys(playerNameMap)
      );
      let sleeperId = null;
      if (bestMatch.bestMatch.rating > 0.5) {
        sleeperId = playerNameMap[bestMatch.bestMatch.target];
      }

      const imageUrl = sleeperId
        ? `https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg`
        : p.headshot;

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
        on_bench: p.on_bench,
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
export async function buildOttoneuTeams(integration: any): Promise<Team[]> {
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

  if (info.matchup?.url) {
    try {
      const res = await fetch(`https://ottoneu.fangraphs.com${info.matchup.url}`);
      if (res.ok) {
        const html = await res.text();
        const dom = new JSDOM(html);
        const document = dom.window.document;

        const homeName =
          document.querySelector('.game-page-home-team-name')?.textContent?.trim() || '';
        const awayName =
          document.querySelector('.game-page-away-team-name')?.textContent?.trim() || '';
        const isHome = homeName.toLowerCase() === info.teamName.toLowerCase();

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
          const realTeam = meta.split(' ')[0] || '';
          const score = parseFloat(pointsCell.textContent?.trim() || '0') || 0;
          const posDisplay = positionCell.textContent?.trim() || '';
          const onBench =
            posDisplay === 'BN' ||
            (cell.getAttribute('data-position') || '').toLowerCase() === 'bench';

          return {
            id,
            name,
            position: cell.getAttribute('data-position') || '',
            realTeam,
            score,
            gameStatus: 'pregame',
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${id}.jpg`,
            on_bench: onBench,
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

  const teams: Team[] = [];
  const week = await getCurrentNflWeek();
  const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
  const playersData = await playersResponse.json();

  const playerNameMap: { [key: string]: string } = {};
  for (const playerId in playersData) {
    const player = playersData[playerId];
    if (player.full_name) {
      playerNameMap[player.full_name.toLowerCase()] = playerId;
    }
  }

  for (const integration of integrations) {
    if (integration.provider === 'sleeper') {
      const sleeperTeams = await buildSleeperTeams(
        integration,
        week,
        playersData
      );
      teams.push(...sleeperTeams);
    } else if (integration.provider === 'yahoo') {
      const yahooTeams = await buildYahooTeams(integration, playerNameMap);
      teams.push(...yahooTeams);
    } else if (integration.provider === 'ottoneu') {
      const ottoneuTeams = await buildOttoneuTeams(integration);
      teams.push(...ottoneuTeams);
    }
  }

  return { teams };
}
