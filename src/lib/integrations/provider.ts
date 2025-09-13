import { League, UserIntegration } from '@/lib/types';

import { Team } from '@/lib/types';

export interface Provider {
  connect(identifier: string): Promise<{ user?: any; error?: string }>;
  remove(integrationId: number): Promise<{ success: boolean; error?: string }>;
  getLeagues(integrationId: number): Promise<{ leagues?: League[]; error?: string }>;
  getIntegration(): Promise<{ integration?: UserIntegration; error?: string }>;
  syncData(integration: UserIntegration): Promise<{ success: boolean; error?: string }>;
  getTeams(integration: UserIntegration, week: number): Promise<{ teams?: Team[]; error?: string }>;
}
