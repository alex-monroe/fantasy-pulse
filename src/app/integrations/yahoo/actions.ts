'use server';

import { createClient } from '@/utils/supabase/server';

export async function connectYahoo(accessToken: string) {
  try {
    console.log('Fetching Yahoo user info');
    const res = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const error = await res.json();
      console.error('Yahoo user info request failed', error);
      return { error: error.error_description || 'Failed to fetch user info' };
    }

    const user = await res.json();
    console.log('Yahoo user info response', user);
    return { user };
  } catch (error) {
    console.error('Unexpected error fetching Yahoo user info', error);
    return { error: 'An unexpected error occurred' };
  }
}

export async function removeYahooIntegration(integrationId: number) {
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

export async function getYahooIntegration() {
  const supabase = createClient();

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
  // This will be replaced with the actual API call to Yahoo
  return { leagues: [] };
}
