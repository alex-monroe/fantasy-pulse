'use server';

import { createClient } from '@/utils/supabase/server';

/**
 * Connects an Ottoneu team to the user's account using the public team URL.
 * @param teamUrl - The Ottoneu team URL (e.g., https://ottoneu.fangraphs.com/football/309/team/2514).
 * @returns The inserted integration or an error.
 */
export async function connectOttoneu(teamUrl: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in to connect your Ottoneu team.' };
  }

  const match = teamUrl.match(/ottoneu\.fangraphs\.com\/football\/(\d+)\/team\/(\d+)/);
  if (!match) {
    return { error: 'Invalid Ottoneu team URL.' };
  }

  const leagueId = match[1];
  const teamId = match[2];

  try {
    const res = await fetch(teamUrl);
    if (!res.ok) {
      return { error: `Failed to fetch team page: ${res.statusText}` };
    }
    const html = await res.text();
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    let teamName = titleMatch ? titleMatch[1] : '';
    if (teamName.includes('-')) {
      teamName = teamName.split('-')[0].trim();
    } else if (teamName.includes('|')) {
      teamName = teamName.split('|')[0].trim();
    }
    if (!teamName) {
      return { error: 'Could not determine team name from page.' };
    }

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

    const { error: leagueError } = await supabase
      .from('leagues')
      .upsert({
        user_id: user.id,
        user_integration_id: integration.id,
        league_id: leagueId,
        name: teamName,
      }, { onConflict: 'league_id,user_integration_id' });
    if (leagueError) {
      return { error: leagueError.message };
    }

    const { error: teamError } = await supabase
      .from('teams')
      .upsert({
        user_integration_id: integration.id,
        team_id: teamId,
        team_key: teamId,
        league_id: leagueId,
        name: teamName,
      }, { onConflict: 'team_id,user_integration_id' });
    if (teamError) {
      return { error: teamError.message };
    }

    return { integration };
  } catch (error) {
    return { error: 'Failed to fetch Ottoneu team page.' };
  }
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
 * Removes an Ottoneu integration from the user's account.
 * @param integrationId - The ID of the integration to remove.
 */
export async function removeOttoneuIntegration(integrationId: number) {
  const supabase = createClient();

  const { error: deleteTeamsError } = await supabase
    .from('teams')
    .delete()
    .eq('user_integration_id', integrationId);
  if (deleteTeamsError) {
    return { error: `Failed to delete teams: ${deleteTeamsError.message}` };
  }

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
 * Gets the teams for an Ottoneu integration from the database.
 * @param integrationId - The ID of the integration.
 */
export async function getTeams(integrationId: number) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('user_integration_id', integrationId);

  if (error) {
    return { error: error.message };
  }

  return { teams: data };
}
