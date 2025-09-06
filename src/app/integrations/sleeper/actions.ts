'use server';

import { supabase } from '@/lib/supabase';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function connectSleeper(username: string) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
      },
    }
  );

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

export async function getLeagues(integrationId: number) {
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
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
      },
    }
  );

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
