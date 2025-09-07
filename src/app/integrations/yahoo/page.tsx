'use client';

import { useState, useEffect } from 'react';
import { getYahooIntegration, getLeagues, removeYahooIntegration, getYahooLeagues, getYahooRoster, getYahooUserTeams, getTeams } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function YahooPage() {
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [integration, setIntegration] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);
  const [players, setPlayers] = useState<any[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  useEffect(() => {
    const checkIntegration = async () => {
      setError(null);
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
      setPlayers([]);
    }

    setIsRemoving(false);
  };

  const handleFetchRoster = async (leagueId: string) => {
    if (!integration || teams.length === 0) return;

    setLoadingRoster(true);
    setPlayers([]);
    setError(null);

    const team = teams.find(t => t.league_id === leagueId);

    if (!team) {
      setError('Could not find a team for this league.');
      setLoadingRoster(false);
      return;
    }

    const { players, error } = await getYahooRoster(integration.id, leagueId, team.team_id);

    if (error) {
      setError(error);
    } else {
      setPlayers(players || []);
    }
    setLoadingRoster(false);
  };

  useEffect(() => {
    if (integration) {
      const fetchLeaguesAndTeams = async () => {
        setError(null);
        // Fetch leagues
        const leaguesDbResponse = await getLeagues(integration.id);
        if (leaguesDbResponse.error) {
          setError(leaguesDbResponse.error);
        } else if (leaguesDbResponse.leagues && leaguesDbResponse.leagues.length > 0) {
          setLeagues(leaguesDbResponse.leagues);
        } else {
          const yahooLeaguesResponse = await getYahooLeagues(integration.id);
          if (yahooLeaguesResponse.error) {
            setError(yahooLeaguesResponse.error);
          } else {
            setLeagues(yahooLeaguesResponse.leagues || []);
          }
        }

        // Fetch teams
        const teamsDbResponse = await getTeams(integration.id);
        if (teamsDbResponse.error) {
          setError(teamsDbResponse.error);
        } else if (teamsDbResponse.teams && teamsDbResponse.teams.length > 0) {
          setTeams(teamsDbResponse.teams);
        } else {
          const yahooTeamsResponse = await getYahooUserTeams(integration.id);
          if (yahooTeamsResponse.error) {
            setError(yahooTeamsResponse.error);
          } else {
            setTeams(yahooTeamsResponse.teams || []);
          }
        }
      };
      fetchLeaguesAndTeams();
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
                    <Button onClick={() => handleFetchRoster(league.league_id)} size="sm">
                      View Roster
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {loadingRoster && <p className="mt-4">Loading roster...</p>}
          {players.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg font-medium">Roster</h3>
              <ul className="mt-2 space-y-2">
                {players.map((player) => (
                  <li key={player.player_key} className="p-2 border rounded-md">
                    {player.name} ({player.display_position})
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
