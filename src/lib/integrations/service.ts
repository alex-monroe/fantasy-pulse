import { createClient } from '@/utils/supabase/server';
import { SleeperProvider } from './sleeper';
import { YahooProvider } from './yahoo';
import { FantasyFootballProvider, UserIntegration } from './types';

const providers: { [key: string]: FantasyFootballProvider } = {
  sleeper: SleeperProvider,
  yahoo: YahooProvider,
};

export class IntegrationService {
  private supabase = createClient();

  private async getIntegration(integrationId: number): Promise<{ integration: UserIntegration | null; error: any }> {
    const { data, error } = await this.supabase
      .from('user_integrations')
      .select('*')
      .eq('id', integrationId)
      .single();
    return { integration: data, error };
  }

  private getProvider(providerName: string): FantasyFootballProvider | null {
    return providers[providerName] || null;
  }

  async connect(providerName: string, userId: string, data: any) {
    const provider = this.getProvider(providerName);
    if (!provider) {
      return { success: false, error: 'Invalid provider' };
    }
    // The connect method in the provider should handle the specifics,
    // including any necessary DB operations for that provider.
    return provider.connect(userId, data);
  }

  async remove(integrationId: number) {
    const { integration, error } = await this.getIntegration(integrationId);
    if (error || !integration) {
      return { success: false, error: 'Integration not found' };
    }

    const provider = this.getProvider(integration.provider);
    if (!provider) {
      return { success: false, error: 'Invalid provider' };
    }

    return provider.removeIntegration(integrationId);
  }

  async getTeamsForAllIntegrations(userId: string): Promise<{ teams: any[], error: any }> {
    const { data: integrations, error } = await this.supabase
      .from('user_integrations')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      return { teams: [], error: error.message };
    }

    const allTeams = [];
    for (const integration of integrations) {
      const provider = this.getProvider(integration.provider);
      if (provider) {
        const { teams } = await provider.getTeams(integration.id);
        allTeams.push(...teams);
      }
    }
    return { teams: allTeams, error: null };
  }

  async getLeagueMatchups(integrationId: number, leagueId: string, week: string) {
    const { integration, error } = await this.getIntegration(integrationId);
    if (error || !integration) {
      return { matchups: [], error: 'Integration not found' };
    }

    const provider = this.getProvider(integration.provider);
    if (!provider) {
      return { matchups: [], error: 'Invalid provider' };
    }

    return provider.getLeagueMatchups(integrationId, leagueId, week);
  }

  async getRoster(integrationId: number, leagueId: string, teamId: string) {
    const { integration, error } = await this.getIntegration(integrationId);
    if (error || !integration) {
      return { players: [], error: 'Integration not found' };
    }

    const provider = this.getProvider(integration.provider);
    if (!provider) {
      return { players: [], error: 'Invalid provider' };
    }

    return provider.getRoster(integrationId, leagueId, teamId);
  }

  async getLeagues(integrationId: number) {
    const { integration, error } = await this.getIntegration(integrationId);
    if (error || !integration) {
      return { leagues: [], error: 'Integration not found' };
    }

    const provider = this.getProvider(integration.provider);
    if (!provider) {
      return { leagues: [], error: 'Invalid provider' };
    }

    return provider.getLeagues(integrationId);
  }
}
