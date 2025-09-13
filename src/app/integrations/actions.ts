'use server';

import { getProvider } from '@/lib/integrations';

export async function getIntegrationForProvider(providerName: string) {
  const provider = getProvider(providerName);
  return provider.getIntegration();
}

export async function connectProvider(providerName: string, identifier: string) {
  const provider = getProvider(providerName);
  return provider.connect(identifier);
}

export async function removeProvider(providerName: string, integrationId: number) {
  const provider = getProvider(providerName);
  return provider.remove(integrationId);
}

export async function getYahooAuthorizationUrl(): Promise<{ url?: string; error?: string }> {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return { error: 'Yahoo integration is not configured.' };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    language: 'en-us',
  });

  return { url: `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}` };
}

export async function getLeaguesForProvider(providerName: string, integrationId: number) {
  const provider = getProvider(providerName);
  return provider.getLeagues(integrationId);
}

export async function getLeagueMatchups(providerName: string, leagueId: string, week: string) {
  // This is not fully implemented in the provider interface, so we will just return an empty array for now.
  return { matchups: [] };
}
