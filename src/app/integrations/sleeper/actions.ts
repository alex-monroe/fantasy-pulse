'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { fetchJson } from '@/lib/fetch-json';
import { getCachedPlayerInfo, setCachedPlayerInfo } from '@/lib/cache';
import {
  SleeperLeague,
  SleeperMatchup,
  SleeperRoster,
  SleeperUser,
  SleeperPlayer,
  SleeperEnrichedMatchup,
} from '@/lib/types';

/**
 * Connects a Sleeper account to the user's account.
 * @param username - The Sleeper username to connect.
 * @returns The Sleeper user object or an error.
 */
export async function connectSleeper(username: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to connect your Sleeper account.' };
  }

  try {
    const { data: sleeperUser, error } = await fetchJson<SleeperUser>(
      `https://api.sleeper.app/v1/user/${username}`
    );
    if (error) {
      return { error: error || 'Failed to fetch user' };
    }
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

/**
 * Removes a Sleeper integration from the user's account.
 * @param integrationId - The ID of the integration to remove.
 * @returns A success message or an error.
 */
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

/**
 * Gets the leagues for a Sleeper integration.
 * @param integrationId - The ID of the integration.
 * @returns A list of leagues or an error.
 */
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

/**
 * Gets the Sleeper integration for the current user.
 * @returns The Sleeper integration or an error.
 */
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

/**
 * Gets the Sleeper leagues for a user and inserts them into the database.
 * @param userId - The Sleeper user ID.
 * @param integrationId - The ID of the integration.
 * @returns A list of leagues or an error.
 */
export async function getSleeperLeagues(userId: string, integrationId: number) {
  const supabase = createClient();
  try {
    const year = new Date().getFullYear();
    const { data: leagues, error } = await fetchJson<SleeperLeague[]>(
      `https://api.sleeper.app/v1/user/${userId}/leagues/nfl/${year}`
    );
    if (error) {
      return { error };
    }

    if (leagues && leagues.length > 0) {
      const leaguesToInsert = leagues.map((league: SleeperLeague) => ({
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

/**
 * Gets the matchups for a league and week.
 * @param leagueId - The ID of the league.
 * @param week - The week to get matchups for.
 * @returns A list of matchups or an error.
 */
export async function getMatchups(leagueId: string, week: string) {
  try {
    const url = `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`;
    const { data: matchups, error } = await fetchJson<SleeperMatchup[]>(url);
    if (error) {
      return { error };
    }
    return { matchups };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the rosters for a league.
 * @param leagueId - The ID of the league.
 * @returns A list of rosters or an error.
 */
export async function getRosters(leagueId: string) {
  try {
    const { data: rosters, error } = await fetchJson<SleeperRoster[]>(
      `https://api.sleeper.app/v1/league/${leagueId}/rosters`
    );
    if (error) {
      return { error };
    }
    return { rosters };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the users in a league.
 * @param leagueId - The ID of the league.
 * @returns A list of users or an error.
 */
export async function getUsersInLeague(leagueId: string) {
  try {
    const { data: users, error } = await fetchJson<SleeperUser[]>(
      `https://api.sleeper.app/v1/league/${leagueId}/users`
    );
    if (error) {
      return { error };
    }
    return { users };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets all NFL players from the Sleeper API.
 * @returns A list of NFL players or an error.
 */
export async function getNflPlayers() {
  const cacheKey = 'sleeper:nfl-players';
  const cachedPlayers = getCachedPlayerInfo<Record<string, SleeperPlayer>>(cacheKey);
  if (cachedPlayers !== undefined) {
    return { players: cachedPlayers };
  }

  try {
    const { data: players, error } = await fetchJson<Record<string, SleeperPlayer>>(
      `https://api.sleeper.app/v1/players/nfl`
    );
    if (error) {
      return { error };
    }
    if (players) {
      setCachedPlayerInfo(cacheKey, players);
    }
    return { players };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}

/**
 * Gets the matchups for a league, including roster and user data.
 * @param leagueId - The ID of the league.
 * @param week - The week to get matchups for.
 * @returns A list of enriched matchups or an error.
 */
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

    const usersMap = new Map(users.map((user) => [user.user_id, user]));
    const rostersMap = new Map(rosters.map((roster) => [roster.roster_id, roster]));

    const enrichedMatchups: SleeperEnrichedMatchup[] = matchups.map((matchup) => {
      const roster = rostersMap.get(matchup.roster_id);
      if (!roster) return matchup as unknown as SleeperEnrichedMatchup;

      const user = usersMap.get(roster.owner_id);
      const matchupPlayers = matchup.players.map((playerId: string) => {
        const playerDetails = players[playerId];
        return {
          player_id: playerId,
          first_name: playerDetails?.first_name || 'Unknown',
          last_name: playerDetails?.last_name || 'Player',
          position: playerDetails?.position || 'N/A',
          team: playerDetails?.team || 'N/A',
          score: matchup.players_points?.[playerId] ?? 0,
        };
      });

      const totalPoints = matchupPlayers.reduce(
        (acc: number, player: { score: number }) => acc + player.score,
        0
      );

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
