'use client';

import { useState, useEffect } from 'react';
import {
  getIntegrationForProvider,
  removeProvider,
  getLeaguesForProvider,
  getYahooAuthorizationUrl,
} from '@/app/integrations/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { League, UserIntegration } from '@/lib/types';

export default function YahooPage() {
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [integration, setIntegration] = useState<UserIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const checkIntegration = async () => {
      setError(null);
      const { integration, error } = await getIntegrationForProvider('yahoo');
      if (error) {
        setError(error);
      } else {
        setIntegration(integration || null);
      }
      setLoading(false);
    };
    checkIntegration();
  }, []);

  const handleConnect = async () => {
    const { url, error } = await getYahooAuthorizationUrl();
    if (error) {
      setError(error);
    } else if (url) {
      window.location.href = url;
    }
  };

  const handleRemove = async () => {
    if (!integration) return;

    setIsRemoving(true);
    setError(null);

    const { error } = await removeProvider('yahoo', integration.id);

    if (error) {
      setError(error);
    } else {
      setIntegration(null);
      setLeagues([]);
    }

    setIsRemoving(false);
  };

  useEffect(() => {
    if (integration) {
      const fetchLeagues = async () => {
        setError(null);
        const { leagues, error } = await getLeaguesForProvider('yahoo', integration.id);
        if (error) {
          setError(error);
        } else if (leagues) {
          setLeagues(leagues);
        }
      };
      fetchLeagues();
    }
  }, [integration]);

  if (loading) {
    return <main className="p-4">Loading...</main>;
  }

  return (
    <main className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Connect to Yahoo</CardTitle>
          <CardDescription>
            {integration
              ? "You have successfully connected your Yahoo account."
              : "Click the button below to connect your Yahoo account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration ? (
            <Button onClick={handleConnect}>Connect Yahoo</Button>
          ) : (
            <div>
              <Button onClick={handleRemove} disabled={isRemoving} variant="destructive">
                {isRemoving ? 'Removing...' : 'Remove Integration'}
              </Button>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          {leagues.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium">Your Leagues</h3>
              <ul className="mt-2 space-y-2">
                {leagues.map((league) => (
                  <li key={league.league_id} className="p-2 border rounded-md flex justify-between items-center">
                    <span>{league.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 bg-gray-800 text-white">
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-2">
            <li>
              If you see a "Yahoo integration not found" error, please try removing the integration and connecting again.
            </li>
            <li>
              If your leagues or teams are not showing up, it might be because you don't have any active teams for the current NFL season in your Yahoo account.
            </li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
