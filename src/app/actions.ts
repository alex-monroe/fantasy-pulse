'use server';

import { createClient } from '@/utils/supabase/server';
import { IntegrationService } from '@/lib/integrations/service';

export async function getTeams() {
  const supabase = createClient();
  const integrationService = new IntegrationService();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { teams, error } = await integrationService.getTeamsForAllIntegrations(user.id);
  if (error) {
    return { error };
  }

  return { teams };
}
