'use server';

import { createClient } from '@/utils/supabase/server';

/**
 * Fetches and parses an Ottoneu team page for basic info.
 * @param teamUrl - The public Ottoneu team URL.
 * @returns Team and league info or an error.
 */
export async function getOttoneuTeamInfo(teamUrl: string) {
  const match = teamUrl.match(/football\/(\d+)\/team\/(\d+)/);
  if (!match) {
    return { error: 'Invalid Ottoneu team URL.' };
  }

  const [, leagueId, teamId] = match;

  try {
    const res = await fetch(teamUrl);
    if (!res.ok) {
      return { error: 'Failed to fetch team page.' };
    }
    const html = await res.text();
    console.log('Fetched Ottoneu page:', html);
    const teamNameMatch = html.match(
      /<span class=["']teamName["']>([^<]+)<\/span>/
    );
    const leagueNameRegex = new RegExp(
      `<a[^>]*href=["']/football/${leagueId}/["'][^>]*>\\s*<span class=["']desktop-navigation["']>([^<]+)<\\/span>`,
      'i'
    );
    let leagueNameMatch = html.match(leagueNameRegex);
    if (!leagueNameMatch) {
      leagueNameMatch = html.match(
        /<span class=["']desktop-navigation["']>([^<]+)<\/span>/
      );
    }
    console.log('League name match result:', leagueNameMatch);

    const teamName = teamNameMatch ? teamNameMatch[1].trim() : 'Unknown Team';
    const leagueName = leagueNameMatch ? leagueNameMatch[1].trim() : 'Unknown League';

    return { teamName, leagueName, leagueId, teamId };
  } catch {
    return { error: 'Failed to fetch team page.' };
  }
}

/**
 * Connects an Ottoneu team to the user's account.
 * @param teamUrl - The public team URL.
 * @returns The parsed team info or an error.
 */
export async function connectOttoneu(teamUrl: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to connect your Ottoneu team.' };
  }

  const info = await getOttoneuTeamInfo(teamUrl);
  if ('error' in info) {
    return { error: info.error };
  }

  const { teamName, leagueName, leagueId, teamId } = info;

  const { data: integration, error: insertError } = await supabase
    .from('user_integrations')
    .insert({
      user_id: user.id,
      provider: 'ottoneu',
      provider_user_id: teamId,
    })
    .select()
    .single();

  if (insertError) {
    return { error: insertError.message };
  }

  const { error: leagueError } = await supabase.from('leagues').upsert({
    league_id: leagueId,
    name: leagueName,
    user_integration_id: integration.id,
  });

  if (leagueError) {
    return { error: leagueError.message };
  }

  return { teamName, leagueName };
}

/**
 * Removes an Ottoneu integration.
 * @param integrationId - The ID of the integration to remove.
 */
export async function removeOttoneuIntegration(integrationId: number) {
  const supabase = createClient();

  const { error: deleteLeaguesError } = await supabase
    .from('leagues')
    .delete()
    .eq('user_integration_id', integrationId);

  if (deleteLeaguesError) {
    return { error: `Failed to delete leagues: ${deleteLeaguesError.message}` };
  }

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
 * Gets the Ottoneu integration for the current user.
 */
export async function getOttoneuIntegration() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', 'ottoneu')
    .single();

  if (error && error.code !== 'PGRST116') {
    return { error: error.message };
  }

  return { integration: data };
}

/**
 * Gets leagues linked to an integration.
 * @param integrationId - The integration ID.
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

