'use client';

import { useState, useEffect } from 'react';
import { removeIntegration, getIntegration, getLeaguesForIntegration, getRosterForIntegration } from '../actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function YahooPage() {
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [integration, setIntegration] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [loadingRosterLeagueId, setLoadingRosterLeagueId] = useState<string | null>(null);

  useEffect(() => {
    const checkIntegration = async () => {
      setError(null);
      const { integration, error } = await getIntegration('yahoo');
      if (error) setError(error);
      else setIntegration(integration);
      setLoading(false);
    };
    checkIntegration();
  }, []);

  const handleConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_YAHOO_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth/yahoo`;
    const scope = 'openid fspt-r';
    const responseType = 'code';
    const url = `https://api.login.yahoo.com/oauth2/request_auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=${responseType}&scope=${encodeURIComponent(scope)}`;
    window.location.href = url;
  };

  const handleRemove = async () => {
    if (!integration) return;
    setIsRemoving(true);
    setError(null);
    const { success, error } = await removeIntegration(integration.id);
    if (error) setError(error);
    else if (success) {
      setIntegration(null);
      setLeagues([]);
      setPlayers([]);
    }
    setIsRemoving(false);
  };

  const handleFetchRoster = async (leagueId: string) => {
    if (!integration) return;
    setLoadingRosterLeagueId(leagueId);
    setPlayers([]);
    setError(null);

    // In Yahoo, the user has one team per league. We can find the team id from the league data.
    // This is a simplification. A more robust solution would be to fetch teams for the league.
    // For now, we assume the user's team id can be derived or is stored somewhere.
    // The current provider implementation doesn't expose a way to get team_id from league_id easily on the client.
    // We will pass the league_id as team_id for now, and the provider will have to resolve it.
    const { players, error } = await getRosterForIntegration(integration.id, leagueId, leagueId);

    if (error) setError(error as string);
    else setPlayers(players || []);
    setLoadingRosterLeagueId(null);
  };

  useEffect(() => {
    if (integration) {
      const fetchLeagues = async () => {
        setError(null);
        const { leagues, error } = await getLeaguesForIntegration(integration.id);
        if (error) setError(error as string);
        else setLeagues(leagues || []);
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
            {integration ? "You have successfully connected your Yahoo account." : "Click the button below to connect your Yahoo account."}
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
                  <li key={league.id} className="p-2 border rounded-md flex justify-between items-center">
                    <span>{league.name}</span>
                    <Button onClick={() => handleFetchRoster(league.id)} size="sm" disabled={loadingRosterLeagueId === league.id}>
                      {loadingRosterLeagueId === league.id ? 'Loading...' : 'View Roster'}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {players.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium">Roster</h3>
              <ul className="mt-2 space-y-2">
                {players.map((player) => (
                  <li key={player.id} className="p-2 border rounded-md">
                    {player.name} ({player.position})
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
            <li>If you see a "Yahoo integration not found" error, please try removing the integration and connecting again.</li>
            <li>If your leagues or teams are not showing up, it might be because you don't have any active teams for the current NFL season in your Yahoo account.</li>
            <li>The "Could not find a team for this league" error can happen if your team data is out of sync. Removing and re-adding the integration should resolve this.</li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
