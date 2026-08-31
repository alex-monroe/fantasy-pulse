'use client';

import { useState, FormEvent, useEffect } from 'react';
import ReactConfetti from 'react-confetti';
import {
  connectEspn,
  getEspnIntegration,
  getEspnLeagueRows,
  getEspnTeamRows,
  getEspnMatchup,
  removeEspnIntegration,
} from './actions';
import { AppNavigation } from '@/components/app-navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The page for managing the ESPN integration.
 *
 * Unlike Sleeper/Yahoo, ESPN has no OAuth flow — the user must copy two
 * cookies (`espn_s2`, `SWID`) from a logged-in browser session. See
 * README.md for details and why there's no way around this.
 * @returns The page for managing the ESPN integration.
 */
export default function EspnPage() {
  const [leagueId, setLeagueId] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<any | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [matchup, setMatchup] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (showConfetti) {
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

  useEffect(() => {
    const checkIntegration = async () => {
      const { integration, error } = await getEspnIntegration();
      if (error) {
        setError(error);
      } else {
        setIntegration(integration);
      }
      setLoading(false);
    };
    checkIntegration();
  }, []);

  useEffect(() => {
    if (!integration) return;
    const fetchLinked = async () => {
      const [leaguesRes, teamsRes] = await Promise.all([
        getEspnLeagueRows(integration.id),
        getEspnTeamRows(integration.id),
      ]);
      if (leaguesRes.error) {
        setError(leaguesRes.error);
        return;
      }
      if (teamsRes.error) {
        setError(teamsRes.error);
        return;
      }
      setLeagues(leaguesRes.leagues || []);
      setTeams(teamsRes.teams || []);

      const league = leaguesRes.leagues?.[0];
      const team = teamsRes.teams?.[0];
      if (league && team) {
        const { matchup, error: matchupError } = await getEspnMatchup(
          integration.id,
          league.league_id,
          team.team_id
        );
        if (matchupError) {
          setError(matchupError);
        } else {
          setMatchup(matchup);
        }
      }
    };
    fetchLinked();
  }, [integration]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setConnecting(true);
    const result = await connectEspn(leagueId, espnS2, swid);
    setConnecting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const { integration, error: integrationError } = await getEspnIntegration();
    if (integrationError) {
      setError(integrationError);
    } else {
      setIntegration(integration);
      setShowConfetti(true);
    }
  };

  const handleRemove = async () => {
    if (!integration) return;
    setIsRemoving(true);
    setError(null);
    const { success, error } = await removeEspnIntegration(integration.id);
    if (error) {
      setError(error);
    } else if (success) {
      setIntegration(null);
      setLeagues([]);
      setTeams([]);
      setMatchup(null);
      setLeagueId('');
      setEspnS2('');
      setSwid('');
    }
    setIsRemoving(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <AppNavigation />
        <main className="flex-1 p-4 sm:p-6 md:p-8">Loading...</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {showConfetti && <ReactConfetti />}
      <AppNavigation />
      <main className="flex-1 p-4 sm:p-6 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Connect to ESPN</CardTitle>
            <CardDescription>
              {integration
                ? 'ESPN account connected.'
                : "ESPN doesn't offer sign-in for third-party apps, so you'll need to copy two cookies from your browser."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!integration ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="leagueId">League ID</Label>
                  <Input
                    id="leagueId"
                    type="text"
                    value={leagueId}
                    onChange={(e) => setLeagueId(e.target.value)}
                    placeholder="e.g. 123456"
                    required
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    Found in your league&apos;s URL: fantasy.espn.com/football/league?leagueId=
                    <strong>123456</strong>
                  </p>
                </div>
                <div>
                  <Label htmlFor="espnS2">espn_s2 cookie</Label>
                  <Input
                    id="espnS2"
                    type="text"
                    value={espnS2}
                    onChange={(e) => setEspnS2(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="swid">SWID cookie</Label>
                  <Input
                    id="swid"
                    type="text"
                    value={swid}
                    onChange={(e) => setSwid(e.target.value)}
                    placeholder="{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}"
                    required
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Log in at fantasy.espn.com, open DevTools → Application (or
                  Storage) → Cookies → fantasy.espn.com, and copy the{' '}
                  <code>espn_s2</code> and <code>SWID</code> values. See
                  README.md for step-by-step instructions.
                </p>
                <Button type="submit" disabled={connecting}>
                  {connecting ? 'Connecting...' : 'Connect'}
                </Button>
              </form>
            ) : (
              <div>
                <Button onClick={handleRemove} disabled={isRemoving} variant="destructive">
                  {isRemoving ? 'Removing...' : 'Remove Integration'}
                </Button>
              </div>
            )}
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {integration && leagues.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Your Leagues</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {leagues.map((league) => (
                  <span key={league.league_id} className="rounded-md border px-3 py-1 text-sm">
                    {league.name}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {matchup && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Week {matchup.week} Matchup</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{matchup.userTeam.name}</CardTitle>
                    <div className="text-2xl font-bold">
                      {matchup.userTeam.totalPoints.toFixed(2)}
                    </div>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{matchup.opponentTeam.name}</CardTitle>
                    <div className="text-2xl font-bold">
                      {matchup.opponentTeam.totalPoints.toFixed(2)}
                    </div>
                  </CardHeader>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
