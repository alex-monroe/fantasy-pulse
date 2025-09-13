'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getProvider } from '@/lib/integrations';
import { UserIntegration } from '@/lib/types';
import { getAuthorizationUrl } from '@/app/integrations/yahoo/actions';

interface ProviderDetail {
  name: string;
  logo: string;
}

const providers: ProviderDetail[] = [
  { name: 'sleeper', logo: '/sleeper-logo.png' },
  { name: 'yahoo', logo: '/yahoo-logo.png' },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<string, UserIntegration | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sleeperUsername, setSleeperUsername] = useState('');

  useEffect(() => {
    async function fetchIntegrations() {
      try {
        const integrationPromises = providers.map(p => getProvider(p.name).getIntegration());
        const results = await Promise.all(integrationPromises);

        const newIntegrations: Record<string, UserIntegration | null> = {};
        results.forEach((res, index) => {
          if (res.error) {
            console.error(`Error fetching ${providers[index].name} integration: ${res.error}`);
          }
          newIntegrations[providers[index].name] = res.integration || null;
        });
        setIntegrations(newIntegrations);
      } catch (err) {
        setError('Failed to fetch integrations');
      } finally {
        setLoading(false);
      }
    }
    fetchIntegrations();
  }, []);

  const handleConnect = async (providerName: string) => {
    try {
      if (providerName === 'yahoo') {
        const res = await getAuthorizationUrl();
        if (res.error) {
          setError(res.error);
        } else {
          window.location.href = res.url;
        }
      } else {
        const provider = getProvider(providerName);
        const res = await provider.connect(sleeperUsername);
        if (res.error) {
          setError(res.error);
        } else {
          window.location.reload();
        }
      }
    } catch (err) {
      setError(`Failed to connect ${providerName}`);
    }
  };

  const handleRemove = async (providerName: string) => {
    const integration = integrations[providerName];
    if (integration) {
      try {
        const provider = getProvider(providerName);
        const res = await provider.remove(integration.id);
        if (res.error) {
          setError(res.error);
        } else {
          setIntegrations(prev => ({ ...prev, [providerName]: null }));
        }
      } catch (err) {
        setError(`Failed to remove ${providerName} integration`);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Manage Integrations</h1>
      {error && <p className="text-red-500">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map(p => (
          <Card key={p.name}>
            <CardHeader>
              <CardTitle className="flex items-center">
                <img src={p.logo} alt={`${p.name} logo`} className="w-6 h-6 mr-2" />
                {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {integrations[p.name] ? (
                <div>
                  <p>Connected</p>
                  <Button onClick={() => handleRemove(p.name)} variant="destructive" className="mt-2">
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col space-y-2">
                  {p.name === 'sleeper' && (
                    <input
                      type="text"
                      value={sleeperUsername}
                      onChange={(e) => setSleeperUsername(e.target.value)}
                      placeholder="Sleeper Username"
                      className="border p-2 rounded"
                    />
                  )}
                  <Button onClick={() => handleConnect(p.name)}>Connect to {p.name.charAt(0).toUpperCase() + p.name.slice(1)}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
