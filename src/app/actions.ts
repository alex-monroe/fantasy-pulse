'use server';

import { createClient } from '@/utils/supabase/server';
import { getProvider } from '@/lib/integrations';
import { Team } from '@/lib/types';

/**
 * Gets the current NFL week from the Sleeper API.
 * @returns The current NFL week.
 */
export async function getCurrentNflWeek() {
  const nflStateResponse = await fetch('https://api.sleeper.app/v1/state/nfl');
  const nflState = await nflStateResponse.json();
  return nflState.week;
}

/**
 * Gets the user's teams from all integrated platforms.
 * @returns A list of teams.
 */
export async function getTeams() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data: integrations, error: integrationsError } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id);

  if (integrationsError) {
    return { error: integrationsError.message };
  }

  let allTeams: Team[] = [];

  for (const integration of integrations) {
    const provider = getProvider(integration.provider);
    const { teams, error } = await provider.getTeams(integration);

    if (error) {
      console.error(`Failed to get teams for ${integration.provider}`, error);
      continue;
    }

    if (teams) {
      allTeams = allTeams.concat(teams);
    }
  }

  return { teams: allTeams };
}
