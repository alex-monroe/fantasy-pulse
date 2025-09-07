'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export async function connectYahoo() {
  // This function is deprecated. The OAuth flow handles the connection.
  return { success: true };
}

export async function removeYahooIntegration(integrationId: number) {
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

export async function getYahooIntegration() {
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
    .eq('provider', 'yahoo')
    .single();

  if (error && error.code !== 'PGRST116') { // ignore no rows found error
    return { error: error.message };
  }

  return { integration: data };
}

export async function getYahooLeagues(integrationId: number) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  const { data: integration, error: integrationError } = await supabase
    .from('user_integrations')
    .select('access_token')
    .eq('id', integrationId)
    .single();

  if (integrationError || !integration) {
    return { error: 'Yahoo integration not found.' };
  }

  const url = 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json';

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // Potentially handle token refresh here in a real app
      const errorBody = await response.text();
      console.error(`Yahoo API Error: ${response.status} ${response.statusText}`, errorBody);
      return { error: `Failed to fetch leagues from Yahoo: ${response.statusText}` };
    }

    const data = await response.json();
    const leaguesFromYahoo = data.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;

    const leaguesToInsert = Object.values(leaguesFromYahoo).filter((l: any) => l.league).map((l: any) => ({
      user_integration_id: integrationId,
      league_id: l.league[0].league_key,
      name: l.league[0].name,
      season: l.league[0].season,
      total_rosters: l.league[0].num_teams,
      status: l.league[0].status,
    }));

    if (leaguesToInsert.length > 0) {
      const { data: insertedLeagues, error: insertError } = await supabase
        .from('leagues')
        .insert(leaguesToInsert)
        .select();

      if (insertError) {
        return { error: `Failed to save leagues to database: ${insertError.message}` };
      }
      return { leagues: insertedLeagues };
    }

    return { leagues: [] };
  } catch (error) {
    return { error: 'An unexpected error occurred while fetching leagues from Yahoo.' };
  }
}
