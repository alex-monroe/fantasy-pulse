'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSleeperIntegration, getLeagues } from '@/app/integrations/sleeper/actions';
import { getYahooIntegration, getYahooRoster, getYahooUserTeams } from '@/app/integrations/yahoo/actions';
import { Team } from '@/lib/types';

export async function getTeams() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const teams: Team[] = [];

  // Sleeper teams
  const { integration: sleeperIntegration } = await getSleeperIntegration();
  if (sleeperIntegration) {
    const { leagues } = await getLeagues(sleeperIntegration.id);
    if (leagues) {
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

        const userRoster = rosters.find((roster: any) => roster.owner_id === sleeperIntegration.provider_user_id);
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
    }
  }

  // Yahoo teams
  const { integration: yahooIntegration } = await getYahooIntegration();
  if (yahooIntegration) {
    const { teams: yahooTeams } = await getYahooUserTeams(yahooIntegration.id);
    if (yahooTeams) {
      for (const team of yahooTeams) {
        const { players: roster } = await getYahooRoster(
          yahooIntegration.id,
          team.league_id,
          team.team_id
        );
        const userPlayers = (roster || []).map((player: any) => ({
          id: player.player_id?.toString() || player.player_key,
          name: player.name,
          position: player.display_position,
          realTeam: player.editorial_team_abbr,
          score: 0,
          gameStatus: 'pregame',
          onUserTeams: 0,
          onOpponentTeams: 0,
          gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
          imageUrl: player.headshot || player.image_url || '',
        }));

        teams.push({
          id: Number(team.team_id),
          name: team.name,
          totalScore: 0,
          players: userPlayers,
          opponent: {
            name: 'Opponent',
            totalScore: 0,
            players: [],
          },
        });
      }
    }
  }

  return { teams };
}
