import { Provider } from '../provider';
import { League, UserIntegration } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';

export class SleeperProvider implements Provider {
  public async connect(username: string): Promise<{ user?: any; error?: string }> {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'You must be logged in to connect your Sleeper account.' };
    }

    try {
      const res = await fetch(`https://api.sleeper.app/v1/user/${username}`);
      if (!res.ok) {
        const error = await res.json();
        return { error: error.message || 'Failed to fetch user' };
      }
      const sleeperUser = await res.json();
      if (!sleeperUser) {
        return { error: 'User not found' };
      }

      const { error: insertError } = await supabase
        .from('user_integrations')
        .insert({
          user_id: user.id,
          provider: 'sleeper',
          provider_user_id: sleeperUser.user_id,
        });

      if (insertError) {
        return { error: insertError.message };
      }

      return { user: sleeperUser };
    } catch (error) {
      return { error: 'An unexpected error occurred' };
    }
  }

  public async remove(integrationId: number): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient();

    const { error: deleteLeaguesError } = await supabase
      .from('leagues')
      .delete()
      .eq('user_integration_id', integrationId);

    if (deleteLeaguesError) {
      return { success: false, error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
    }

    const { error: deleteIntegrationError } = await supabase
      .from('user_integrations')
      .delete()
      .eq('id', integrationId);

    if (deleteIntegrationError) {
      return { success: false, error: `Failed to delete integration: ${deleteIntegrationError.message}` };
    }

    return { success: true };
  }

  public async getLeagues(integrationId: number): Promise<{ leagues?: League[]; error?: string }> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('leagues')
      .select('*')
      .eq('user_integration_id', integrationId);

    if (error) {
      return { error: error.message };
    }

    return { leagues: data };
  }

  public async getIntegration(): Promise<{ integration?: UserIntegration; error?: string }> {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'You must be logged in.' };
    }

    const { data, error } = await supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'sleeper')
      .single();

    if (error && error.code !== 'PGRST116') {
      return { error: error.message };
    }

    return { integration: data };
  }

  public async syncData(integration: UserIntegration): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient();
    try {
      const year = new Date().getFullYear();
      const res = await fetch(`https://api.sleeper.app/v1/user/${integration.provider_user_id}/leagues/nfl/${year}`);
      if (!res.ok) {
        const error = await res.json();
        return { success: false, error: error.message || 'Failed to fetch leagues' };
      }
      const leagues = await res.json();

      if (leagues && leagues.length > 0) {
        const leaguesToInsert = leagues.map((league: any) => ({
          league_id: league.league_id,
          name: league.name,
          user_integration_id: integration.id,
          season: league.season,
          total_rosters: league.total_rosters,
          status: league.status,
          user_id: integration.user_id,
        }));

        const { error: insertError } = await supabase.from('leagues').upsert(leaguesToInsert);
        if (insertError) {
          return { success: false, error: insertError.message };
        }
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  public async getTeams(integration: UserIntegration): Promise<{ teams?: any[]; error?: string }> {
    const week = new Date().getFullYear();
    const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
    const playersData = await playersResponse.json();

    const { leagues, error: leaguesError } = await this.getLeagues(integration.id);
    if (leaguesError || !leagues) {
      return { error: 'Could not fetch leagues for sleeper' };
    }

    const teams = [];
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
    return { teams };
  }
}
