'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSleeperIntegration, getLeagues } from '@/app/integrations/sleeper/actions';
import {
  getYahooIntegration,
  getYahooUserTeams,
  getYahooRoster,
  getYahooMatchups,
} from '@/app/integrations/yahoo/actions';
import { Team, Player } from '@/lib/types';

export async function getCurrentNflWeek() {
  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  return nflState.week;
}

export async function getTeams() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

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

        const opponentRoster = rosters.find((roster: any) => roster.roster_id === userMatchup.matchup_id);
        if (!opponentRoster) continue;

        // Fetch all users in the league. This is done once per league.
        // The Sleeper API does not provide an endpoint to get all users for multiple leagues at once.
        const leagueUsersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/users`);
        const leagueUsers = await leagueUsersResponse.json();

        const opponentUser = leagueUsers.find((user: any) => user.user_id === opponentRoster.owner_id);
        const opponentName = opponentUser?.metadata?.team_name || opponentUser?.display_name || 'Opponent';

        const userPlayers = userRoster.players.map((playerId: string) => {
          const player = playersData[playerId];
          return {
            id: playerId,
            name: player.full_name,
            position: player.position,
            realTeam: player.team,
            score: 0,
            gameStatus: 'pregame',
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
            on_bench: !userRoster.starters.includes(playerId),
          };
        });

        const opponentPlayers = opponentRoster.players.map((playerId: string) => {
            const player = playersData[playerId];
            return {
                id: playerId,
                name: player.full_name,
                position: player.position,
                realTeam: player.team,
                score: 0,
                gameStatus: 'pregame',
                onUserTeams: 0,
                onOpponentTeams: 0,
                gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
                imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
                on_bench: !opponentRoster.starters.includes(playerId),
            };
        });

        teams.push({
          id: league.id,
          name: league.name,
          totalScore: 0,
          players: userPlayers,
          opponent: {
            name: opponentName,
            totalScore: 0,
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

        const mapYahooPlayer = (p: any): Player => {
          const sleeperId = playerNameMap[p.name.toLowerCase()];
          const imageUrl = sleeperId
            ? `https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg`
            : p.headshot;

          return {
            id: p.player_key,
            name: p.name,
            position: p.display_position,
            realTeam: p.editorial_team_abbr,
            score: 0,
            gameStatus: 'pregame',
            onUserTeams: 0,
            onOpponentTeams: 0,
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
            imageUrl: imageUrl,
          };
        };

        const mappedUserPlayers: Player[] = userPlayers.map(mapYahooPlayer);
        const mappedOpponentPlayers: Player[] = opponentPlayers.map(mapYahooPlayer);

        teams.push({
          id: team.id,
          name: userTeam.name,
          totalScore: 0,
          players: mappedUserPlayers,
          opponent: {
            name: opponentTeam.name,
            totalScore: 0,
            players: mappedOpponentPlayers,
          },
        });
      }
    }
  }

  return { teams };
}
