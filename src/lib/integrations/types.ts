import { Team, Player } from '@/lib/types';

export interface UserIntegration {
  id: number;
  user_id: string;
  provider: string;
  provider_user_id: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
}

export interface ProviderLeague {
    id: string;
    name: string;
    // other league properties...
}

export interface FantasyFootballProvider {
  connect(userId: string, data: any): Promise<{ success: boolean; error?: string }>;
  removeIntegration(integrationId: number): Promise<{ success: boolean; error?: string }>;
  getTeams(integrationId: number): Promise<{ teams: Team[]; error: any }>;
  getLeagues(integrationId: number): Promise<{ leagues: ProviderLeague[]; error: any }>;
  getLeagueMatchups(integrationId: number, leagueId: string, week: string): Promise<{ matchups: any[]; error: any }>;
  getRoster(integrationId: number, leagueId: string, teamId: string): Promise<{ players: Player[]; error: any }>;
}
