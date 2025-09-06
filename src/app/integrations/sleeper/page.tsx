'use client';

import { useState, FormEvent, useEffect } from 'react';
import { connectSleeper, getSleeperLeagues, getSleeperIntegration, getLeagues } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SleeperPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [integration, setIntegration] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkIntegration = async () => {
      const { integration, error } = await getSleeperIntegration();
      if (error) {
        setError(error);
      } else {
        setIntegration(integration);
      }
      setLoading(false);
    };
    checkIntegration();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { user, error: userError } = await connectSleeper(username);
    if (userError) {
      setError(userError);
      return;
    }
    const { integration, error: integrationError } = await getSleeperIntegration();
    if (integrationError) {
      setError(integrationError);
    } else {
      setIntegration(integration);
    }
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

        // If no leagues in DB, fetch from Sleeper API and persist
        const sleeperResponse = await getSleeperLeagues(integration.provider_user_id, integration.id);
        if (sleeperResponse.error) {
          setError(sleeperResponse.error);
        } else {
          setLeagues(sleeperResponse.leagues || []);
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
          <CardTitle>Connect to Sleeper</CardTitle>
          <CardDescription>
            {integration
              ? "You have successfully connected your Sleeper account."
              : "Enter your Sleeper username to connect your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Sleeper Username</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit">Connect</Button>
            </form>
          )}
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
