'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSleeperIntegration, getLeagues as getSleeperLeagues } from '@/app/integrations/sleeper/actions';
import { getYahooIntegration, getLeagues as getYahooLeagues, getYahooRoster, getYahooUserTeams, getYahooMatchups, getYahooPlayerStats } from '@/app/integrations/yahoo/actions';
import { Team } from '@/lib/types';

async function getSleeperTeams() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

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

  const { leagues, error: leaguesError } = await getSleeperLeagues(integration.id);
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

async function getYahooTeams() {
    const { integration, error: integrationError } = await getYahooIntegration();
    if (integrationError) {
        return { error: integrationError };
    }
    if (!integration) {
        return { teams: [] };
    }

    let { leagues, error: leaguesError } = await getYahooLeagues(integration.id);
    if (leaguesError) {
        return { error: leaguesError };
    }
    if (!leagues) {
        return { teams: [] };
    }

    let { teams: userTeams, error: teamsError } = await getYahooUserTeams(integration.id);
    if (teamsError) {
        return { error: teamsError };
    }
    if (!userTeams) {
        return { teams: [] };
    }

    const teams: Team[] = [];

    for (const league of leagues) {
        const userTeam = userTeams.find(t => t.league_id === league.league_id);
        if (!userTeam) {
            continue;
        }

        const { matchups, error: matchupsError } = await getYahooMatchups(integration.id, league.league_id);
        if (matchupsError) {
            console.error(`Could not get matchups for league ${league.league_id}: ${matchupsError}`);
            continue;
        }

        const userMatchup = matchups.find(m => m.teams.some(t => t.team_id === userTeam.team_id));
        if (!userMatchup) {
            continue;
        }

        const opponentTeamData = userMatchup.teams.find(t => t.team_id !== userTeam.team_id);
        if (!opponentTeamData) {
            continue;
        }

        const { players: userPlayers, error: userRosterError } = await getYahooRoster(integration.id, league.league_id, userTeam.team_id);
        if (userRosterError) {
            console.error(`Could not get roster for team ${userTeam.team_id} in league ${league.league_id}: ${userRosterError}`);
            continue;
        }

        const { players: opponentPlayers, error: opponentRosterError } = await getYahooRoster(integration.id, league.league_id, opponentTeamData.team_id);
        if (opponentRosterError) {
            console.error(`Could not get roster for opponent team ${opponentTeamData.team_id} in league ${league.league_id}: ${opponentRosterError}`);
            continue;
        }

        const allUserPlayers = userPlayers.map(p => p.player_id);
        const allOpponentPlayers = opponentPlayers.map(p => p.player_id);

        const formatPlayer = (player: any, isOpponent: boolean) => {
            const score = player.player_points?.total || 0;
            const gameStatus = score > 0 ? 'final' : 'pregame';

            const onUserTeams = allUserPlayers.includes(player.player_id) ? 1 : 0;
            const onOpponentTeams = allOpponentPlayers.includes(player.player_id) ? 1 : 0;

            return {
                id: player.player_id.toString(),
                name: player.name.full,
                position: player.display_position,
                realTeam: player.editorial_team_abbr,
                score: score,
                gameStatus: gameStatus,
                onUserTeams: onUserTeams,
                onOpponentTeams: onOpponentTeams,
                // gameDetails are not available from the Yahoo API
                gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
                imageUrl: player.headshot?.url || 'https://s.yimg.com/dh/ap/default/151215/fantasy-football-player-icon.png',
            };
        };

        const formattedUserPlayers = userPlayers.map(formatPlayer);
        const formattedOpponentPlayers = opponentPlayers.map(formatPlayer);

        teams.push({
            id: league.id,
            name: league.name,
            totalScore: formattedUserPlayers.reduce((acc, p) => acc + p.score, 0),
            players: formattedUserPlayers,
            opponent: {
                name: opponentTeamData.name,
                totalScore: formattedOpponentPlayers.reduce((acc, p) => acc + p.score, 0),
                players: formattedOpponentPlayers,
            },
        });
    }

    return { teams };
}

export async function getTeams() {
    const sleeperPromise = getSleeperTeams();
    const yahooPromise = getYahooTeams();

    const [sleeperResult, yahooResult] = await Promise.all([sleeperPromise, yahooPromise]);

    const allTeams = [...(sleeperResult.teams || []), ...(yahooResult.teams || [])];

    if (sleeperResult.error || yahooResult.error) {
        const errorMessage = [sleeperResult.error, yahooResult.error].filter(Boolean).join(', ');
        return { teams: allTeams, error: errorMessage };
    }

    return { teams: allTeams };
}
