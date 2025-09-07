'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function connectSleeper(username: string) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

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
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

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
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
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
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

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
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
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

      // Manual upsert logic
      const { data: existingLeagues, error: selectError } = await supabase
        .from('leagues')
        .select('league_id')
        .eq('user_integration_id', integrationId);

      if (selectError) {
        return { error: `Failed to query existing leagues: ${selectError.message}` };
      }

      const existingLeagueIds = new Set(existingLeagues.map(l => l.league_id));
      const toInsert = leaguesToInsert.filter(l => !existingLeagueIds.has(l.league_id));
      const toUpdate = leaguesToInsert.filter(l => existingLeagueIds.has(l.league_id));

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('leagues').insert(toInsert);
        if (insertError) {
          return { error: `Failed to insert new leagues: ${insertError.message}` };
        }
      }

      for (const league of toUpdate) {
        const { error: updateError } = await supabase
          .from('leagues')
          .update(league)
          .eq('league_id', league.league_id)
          .eq('user_integration_id', integrationId);
        if (updateError) {
          return { error: `Failed to update league ${league.league_id}: ${updateError.message}` };
        }
      }
    }

    // After upserting, fetch all leagues for the integration to return them
    const { data: finalLeagues, error: finalSelectError } = await supabase
      .from('leagues')
      .select('*')
      .eq('user_integration_id', integrationId);

    if (finalSelectError) {
      return { error: `Failed to fetch final leagues: ${finalSelectError.message}` };
    }

    return { leagues: finalLeagues };
  } catch (error) {
    return { error: 'An unexpected error occurred' };
  }
}
