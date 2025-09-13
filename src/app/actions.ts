'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSleeperIntegration, getLeagues } from '@/app/integrations/sleeper/actions';
import {
  getYahooIntegration,
  getYahooUserTeams,
  getYahooRoster,
  getYahooMatchups,
  getYahooPlayerScores,
} from '@/app/integrations/yahoo/actions';
import { Team, Player } from '@/lib/types';
import { mockTeams } from '@/lib/mock-data';
import { findBestMatch } from 'string-similarity';

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
 * Gets the user's teams from all integrated platforms.
 * @returns A list of teams.
 */
export async function getTeams() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  if (process.env.MOCK_EXTERNAL_APIS === 'true') {
    return { teams: mockTeams };
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
      const { leagues, error: leaguesError } = await getLeagues(integration.id);
      if (leaguesError || !leagues) {
        continue;
      }

      for (const league of leagues) {
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`);
        const rosters = await rostersResponse.json();

        const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`);
        const matchups = await matchupsResponse.json();

        const userRoster = rosters.find((roster: any) => roster.owner_id === integration.provider_user_id);
        if (!userRoster) continue;

        const userMatchup = matchups.find((matchup: any) => matchup.roster_id === userRoster.roster_id);
        if (!userMatchup) continue;

        const opponentMatchup = matchups.find(
          (matchup: any) =>
            matchup.matchup_id === userMatchup.matchup_id && matchup.roster_id !== userRoster.roster_id
        );

        const opponentRoster = opponentMatchup
          ? rosters.find((roster: any) => roster.roster_id === opponentMatchup.roster_id)
          : null;

        // Fetch all users in the league. This is done once per league.
        // The Sleeper API does not provide an endpoint to get all users for multiple leagues at once.
        const leagueUsersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`);
        const leagueUsers = await leagueUsersResponse.json();

        const userLeagueInfo = leagueUsers.find((user: any) => user.user_id === integration.provider_user_id);
        const userName = userLeagueInfo?.metadata?.team_name || userLeagueInfo?.display_name || 'My Team';

        const opponentUser = opponentRoster
          ? leagueUsers.find((user: any) => user.user_id === opponentRoster.owner_id)
          : null;
        const opponentName = opponentUser?.metadata?.team_name || opponentUser?.display_name || 'Opponent';

        const userPlayers = userRoster.players.map((playerId: string) => {
          const player = playersData[playerId];
          const score =
            userMatchup.players_points && userMatchup.players_points[playerId]
              ? userMatchup.players_points[playerId]
              : 0;
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

        const opponentPlayers = opponentRoster
          ? opponentRoster.players.map((playerId: string) => {
              const player = playersData[playerId];
              const score =
                opponentMatchup.players_points && opponentMatchup.players_points[playerId]
                  ? opponentMatchup.players_points[playerId]
                  : 0;

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
    } else if (integration.provider === 'yahoo') {
      const { teams: yahooApiTeams, error: teamsError } = await getYahooUserTeams(integration.id);
      if (teamsError || !yahooApiTeams) {
        continue;
      }

      for (const team of yahooApiTeams) {
        const { matchups, error: matchupsError } = await getYahooMatchups(integration.id, team.team_key);
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

        const { players: userPlayerScores, error: userScoresError } = await getYahooPlayerScores(
          integration.id,
          userTeam.team_key
        );
        if (userScoresError) {
          console.error(`Could not fetch user player scores for team ${userTeam.team_key}`, userScoresError);
        }

        const { players: opponentPlayerScores, error: opponentScoresError } = await getYahooPlayerScores(
          integration.id,
          opponentTeam.team_key
        );
        if (opponentScoresError) {
          console.error(
            `Could not fetch opponent player scores for team ${opponentTeam.team_key}`,
            opponentScoresError
          );
        }

        const userScoresMap = new Map(userPlayerScores?.map(p => [p.player_key, p.totalPoints]));
        const opponentScoresMap = new Map(opponentPlayerScores?.map(p => [p.player_key, p.totalPoints]));

        const mapYahooPlayer = (p: any, scoresMap: Map<string, number>): Player => {
          const bestMatch = findBestMatch(p.name.toLowerCase(), Object.keys(playerNameMap));
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

        const mappedUserPlayers: Player[] = userPlayers.map(p => mapYahooPlayer(p, userScoresMap));
        const mappedOpponentPlayers: Player[] = opponentPlayers.map(p => mapYahooPlayer(p, opponentScoresMap));

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
    }
  }

  return { teams };
}
