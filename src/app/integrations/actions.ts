'use server';

import { createClient } from '@/utils/supabase/server';
import { IntegrationService } from '@/lib/integrations/service';
import { revalidatePath } from 'next/cache';

export async function connectSleeper(username: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authorized' };

  const service = new IntegrationService();
  const result = await service.connect('sleeper', user.id, { username });
  revalidatePath('/integrations/sleeper');
  return result;
}

export async function removeIntegration(integrationId: number) {
  const service = new IntegrationService();
  const result = await service.remove(integrationId);
  revalidatePath('/integrations/sleeper');
  revalidatePath('/integrations/yahoo');
  return result;
}

export async function getIntegration(provider: 'sleeper' | 'yahoo') {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authorized' };

  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('provider', provider)
    .single();

  return { integration: data, error: error?.message };
}

export async function getLeaguesForIntegration(integrationId: number) {
    const service = new IntegrationService();
    return service.getLeagues(integrationId);
}

export async function getLeagueMatchupsForIntegration(integrationId: number, leagueId: string, week: string) {
    const service = new IntegrationService();
    return service.getLeagueMatchups(integrationId, leagueId, week);
}

export async function getRosterForIntegration(integrationId: number, leagueId: string, teamId: string) {
    const service = new IntegrationService();
    return service.getRoster(integrationId, leagueId, teamId);
}
