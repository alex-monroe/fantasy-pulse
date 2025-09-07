'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSleeperIntegration, getLeagues } from '@/app/integrations/sleeper/actions';
import { getYahooIntegration, getYahooLeagues, getYahooRoster, getYahooUserTeams, getYahooMatchup } from '@/app/integrations/yahoo/actions';
import { Team, Player } from '@/lib/types';

export async function getTeams() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const teams: Team[] = [];

  // Sleeper Integration
  const { integration: sleeperIntegration, error: sleeperIntegrationError } = await getSleeperIntegration();
  if (sleeperIntegrationError) {
    return { error: sleeperIntegrationError };
  }

  if (sleeperIntegration) {
    const { leagues, error: leaguesError } = await getLeagues(sleeperIntegration.id);
    if (leaguesError) {
      return { error: leaguesError };
    }
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

  // Yahoo Integration
  const { integration: yahooIntegration, error: yahooIntegrationError } = await getYahooIntegration();
  if (yahooIntegrationError) {
    return { error: yahooIntegrationError };
  }

  if (yahooIntegration) {
    const { leagues, error: leaguesError } = await getYahooLeagues(yahooIntegration.id);
    if (leaguesError) {
      return { error: leaguesError };
    }

    const { teams: userTeams, error: teamsError } = await getYahooUserTeams(yahooIntegration.id);
    if (teamsError) {
      return { error: teamsError };
    }

    if (leagues && userTeams) {
      for (const league of leagues) {
        const userTeam = userTeams.find(t => t.league_id === league.league_id);
        if (!userTeam) {
          continue;
        }

        const { players, error: rosterError } = await getYahooRoster(yahooIntegration.id, league.league_id, userTeam.team_id);
        if (rosterError) {
          return { error: rosterError };
        }

        const userPlayers: Player[] = players.map((player: any) => ({
          id: player.player_id,
          name: player.name,
          position: player.display_position,
          realTeam: player.editorial_team_abbr,
          score: 0, // TODO: Get player score
          gameStatus: 'pregame', // TODO: Get game status
          onUserTeams: 0, // TODO: Calculate onUserTeams
          onOpponentTeams: 0, // TODO: Calculate onOpponentTeams
          gameDetails: { score: '', timeRemaining: '', fieldPosition: '' }, // TODO: Get game details
          imageUrl: player.headshot,
        }));

        const { opponent, error: matchupError } = await getYahooMatchup(yahooIntegration.id, league.league_id, userTeam.team_id);
        if (matchupError) {
          // just continue, we don't want to block the whole page for one failed matchup
          console.error(matchupError);
        }

        let opponentPlayers: Player[] = [];
        if (opponent) {
            const { players, error: opponentRosterError } = await getYahooRoster(yahooIntegration.id, league.league_id, opponent.team_id);
            if (opponentRosterError) {
                console.error(opponentRosterError);
            } else {
                opponentPlayers = players.map((player: any) => ({
                    id: player.player_id,
                    name: player.name,
                    position: player.display_position,
                    realTeam: player.editorial_team_abbr,
                    score: 0,
                    gameStatus: 'pregame',
                    onUserTeams: 0,
                    onOpponentTeams: 0,
                    gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
                    imageUrl: player.headshot,
                }));
            }
        }

        teams.push({
          id: league.id,
          name: league.name,
          totalScore: 0, // TODO: Calculate total score
          players: userPlayers,
          opponent: {
            name: opponent?.name || 'Opponent',
            totalScore: 0,
            players: opponentPlayers,
          },
        });
      }
    }
  }

  return { teams };
}
