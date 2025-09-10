'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function connectSleeper(username: string) {
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

export async function removeSleeperIntegration(integrationId: number) {
  const supabase = createClient();

  // First, delete all leagues associated with the integration
  const { error: deleteLeaguesError } = await supabase
    .from('leagues')
    .delete()
    .eq('user_integration_id', integrationId);

  if (deleteLeaguesError) {
    return { error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
  }

  // Then, delete the integration itself
  const { error: deleteIntegrationError } = await supabase
    .from('user_integrations')
    .delete()
    .eq('id', integrationId);

  if (deleteIntegrationError) {
    return { error: `Failed to delete integration: ${deleteIntegrationError.message}` };
  }

  return { success: true };
}

export async function getLeagues(integrationId: number) {
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

export async function getSleeperIntegration() {
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

  if (error && error.code !== 'PGRST116') { // ignore no rows found error
    return { error: error.message };
  }

  return { integration: data };
}

export async function getSleeperLeagues(userId: string, integrationId: number) {
  const supabase = createClient();
  try {
    const year = new Date().getFullYear();
    const res = await fetch(`https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${year}`);
    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to fetch leagues' };
    }
    const leagues = await res.json();

    if (leagues && leagues.length > 0) {
      const leaguesToInsert = leagues.map((league: any) => ({
        league_id: league.league_id,
        name: league.name,
        user_integration_id: integrationId,
        season: league.season,
        total_rosters: league.total_rosters,
        status: league.status,
      }));

      const { error: insertError } = await supabase.from('leagues').upsert(leaguesToInsert);
      if (insertError) {
        return { error: insertError.message };
      }
    }

    return { leagues };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

export async function getMatchups(leagueId: string, week: string) {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to fetch matchups' };
    }
    const matchups = await res.json();
    return { matchups };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

export async function getRosters(leagueId: string) {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to fetch rosters' };
    }
    const rosters = await res.json();
    return { rosters };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

export async function getUsersInLeague(leagueId: string) {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to fetch users' };
    }
    const users = await res.json();
    return { users };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

export async function getNflPlayers() {
  try {
    const res = await fetch(`https://api.sleeper.app/v1/players/nfl`);
    if (!res.ok) {
      const error = await res.json();
      return { error: error.message || 'Failed to fetch nfl players' };
    }
    const players = await res.json();
    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

export async function getLeagueMatchups(leagueId: string, week: string) {
  try {
    const [matchupsRes, rostersRes, usersRes, playersRes] = await Promise.all([
      getMatchups(leagueId, week),
      getRosters(leagueId),
      getUsersInLeague(leagueId),
      getNflPlayers(),
    ]);

    if (matchupsRes.error) return { error: matchupsRes.error };
    if (rostersRes.error) return { error: rostersRes.error };
    if (usersRes.error) return { error: usersRes.error };
    if (playersRes.error) return { error: playersRes.error };

    const { matchups } = matchupsRes;
    const { rosters } = rostersRes;
    const { users } = usersRes;
    const { players } = playersRes;

    const usersMap = new Map(users.map((user: any) => [user.user_id, user]));
    const rostersMap = new Map(rosters.map((roster: any) => [roster.roster_id, roster]));

    const enrichedMatchups = matchups.map((matchup: any) => {
      const roster = rostersMap.get(matchup.roster_id);
      if (!roster) return matchup;

      const user = usersMap.get(roster.owner_id);
      const matchupPlayers = matchup.players.map((playerId: string) => {
        const playerDetails = players[playerId];
        return {
          player_id: playerId,
          first_name: playerDetails?.first_name || 'Unknown',
          last_name: playerDetails?.last_name || 'Player',
          position: playerDetails?.position || 'N/A',
          team: playerDetails?.team || 'N/A',
          score: matchup.players_points[playerId] || 0,
        };
      });

      const totalPoints = matchupPlayers.reduce((acc: number, player: any) => acc + player.score, 0);

      return {
        ...matchup,
        user: user ? { display_name: user.display_name, avatar: user.avatar } : { display_name: 'Unknown User' },
        players: matchupPlayers,
        total_points: totalPoints,
      };
    });

    return { matchups: enrichedMatchups };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching league matchups' };
  }
}
