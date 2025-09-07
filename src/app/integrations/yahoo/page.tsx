'use client';

import { useState, useEffect } from 'react';
import { getYahooIntegration, getLeagues, removeYahooIntegration, getYahooLeagues } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function YahooPage() {
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [integration, setIntegration] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const checkIntegration = async () => {
      const { integration, error } = await getYahooIntegration();
      if (error) {
        setError(error);
      } else {
        setIntegration(integration);
      }
      setLoading(false);
    };
    checkIntegration();
  }, []);

  const handleConnect = () => {
    const client_id = 'dj0yJmk9UVNWVnFlVjhJVEFsJmQ9WVdrOWVtMDRjRkJEYVd3bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWU0';
    const redirect_uri = `${window.location.origin}/api/auth/yahoo`;
    const scope = 'openid fspt-r';
    const response_type = 'code';
    const url = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=${response_type}&scope=${encodeURIComponent(scope)}`;
    window.location.href = url;
  };

  const handleRemove = async () => {
    if (!integration) return;

    setIsRemoving(true);
    setError(null);

    const { success, error } = await removeYahooIntegration(integration.id);

    if (error) {
      setError(error);
    } else if (success) {
      setIntegration(null);
      setLeagues([]);
    }

    setIsRemoving(false);
  };

  useEffect(() => {
    if (integration) {
      const fetchLeagues = async () => {
        // First, try to get leagues from our DB
        const dbResponse = await getLeagues(integration.id);

        if (dbResponse.error) {
          setError(dbResponse.error);
          return;
        }
        if (dbResponse.leagues && dbResponse.leagues.length > 0) {
          setLeagues(dbResponse.leagues);
          return;
        }

        // If no leagues in DB, fetch from Yahoo API and persist
        const yahooResponse = await getYahooLeagues(integration.id);
        if (yahooResponse.error) {
          setError(yahooResponse.error);
        } else {
          setLeagues(yahooResponse.leagues || []);
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
                  <li key={league.league_id} className="p-2 border rounded-md">
                    {league.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
