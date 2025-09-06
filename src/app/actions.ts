'use server';

import { createClient } from '@/utils/supabase/server';
import { getSleeperIntegration, getLeagues } from '@/app/integrations/sleeper/actions';
import { Team } from '@/lib/types';

export async function getTeams() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { integration, error: integrationError } = await getSleeperIntegration();
  if (integrationError) {
    return { error: integrationError };
  }
  if (!integration) {
    return { teams: [] };
  }

  const { leagues, error: leaguesError } = await getLeagues(integration.id);
  if (leaguesError) {
    return { error: leaguesError };
  }
  if (!leagues) {
    return { teams: [] };
  }

  const teams: Team[] = [];

  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  const week = nflState.week;

  const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
  const players = await playersResponse.json();

  for (const league of leagues) {
    const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/rosters`);
    const rosters = await rostersResponse.json();

    const matchupsResponse = await fetch(`https://api.sleeper.app/v1/league/${league.league_id}/matchups/${week}`);
    const matchups = await matchupsResponse.json();

    const userRoster = rosters.find((roster: any) => roster.owner_id === integration.provider_user_id);
    if (!userRoster) {
      continue;
    }

    const userMatchup = matchups.find((matchup: any) => matchup.roster_id === userRoster.roster_id);
    if (!userMatchup) {
      continue;
    }

    const opponentRoster = rosters.find((roster: any) => roster.roster_id === userMatchup.matchup_id);
    if (!opponentRoster) {
      continue;
    }

    const userPlayers = userRoster.players.map((playerId: string) => {
      const player = players[playerId];
      return {
        id: playerId,
        name: player.full_name,
        position: player.position,
        realTeam: player.team,
        score: 0, // TODO: Get player score
        gameStatus: 'pregame', // TODO: Get game status
        onUserTeams: 0, // TODO: Calculate onUserTeams
        onOpponentTeams: 0, // TODO: Calculate onOpponentTeams
        gameDetails: { score: '', timeRemaining: '', fieldPosition: '' }, // TODO: Get game details
        imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
      };
    });

    const opponentPlayers = opponentRoster.players.map((playerId: string) => {
        const player = players[playerId];
        return {
            id: playerId,
            name: player.full_name,
            position: player.position,
            realTeam: player.team,
            score: 0, // TODO: Get player score
            gameStatus: 'pregame', // TODO: Get game status
            onUserTeams: 0, // TODO: Calculate onUserTeams
            onOpponentTeams: 0, // TODO: Calculate onOpponentTeams
            gameDetails: { score: '', timeRemaining: '', fieldPosition: '' }, // TODO: Get game details
            imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
        };
    });

    teams.push({
      id: league.id,
      name: league.name,
      totalScore: 0, // TODO: Calculate total score
      players: userPlayers,
      opponent: {
        name: 'Opponent', // TODO: Get opponent name
        totalScore: 0, // TODO: Calculate opponent total score
        players: opponentPlayers,
      },
    });
  }


  return { teams };
}
