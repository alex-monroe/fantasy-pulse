'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  connectOttoneu,
  getOttoneuIntegration,
  removeOttoneuIntegration,
  getLeagues,
  getOttoneuTeamInfo,
} from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Page for managing the Ottoneu integration.
 */
export default function OttoneuPage() {
  const [leagueUrl, setLeagueUrl] = useState('');
  const [teamQuery, setTeamQuery] = useState('');
  const [integration, setIntegration] = useState<any | null>(null);
  const [teamName, setTeamName] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [matchup, setMatchup] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { integration, error } = await getOttoneuIntegration();
      if (error) {
        setError(error);
        return;
      }
      if (integration) {
        setIntegration(integration);
        const { leagues } = await getLeagues(integration.id);
        if (leagues && leagues[0]) {
          setLeagueName(leagues[0].name);
          const info = await getOttoneuTeamInfo(`https://ottoneu.fangraphs.com/football/${leagues[0].league_id}/team/${integration.provider_user_id}`);
          if ('teamName' in info) {
            setTeamName(info.teamName);
            setTeamQuery(info.teamName);
          }
          if ('matchup' in info) {
            setMatchup(info.matchup);
          }
        }
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { teamName, leagueName, matchup, error } = await connectOttoneu(
      leagueUrl,
      teamQuery
    );
    if (error) {
      setError(error);
      return;
    }
    setTeamName(teamName);
    setLeagueName(leagueName);
    if (matchup) {
      setMatchup(matchup);
    } else {
      setMatchup(null);
    }
    const { integration } = await getOttoneuIntegration();
    setIntegration(integration);
  };

  const handleRemove = async () => {
    if (!integration) return;
    setIsRemoving(true);
    setError(null);
    const { error } = await removeOttoneuIntegration(integration.id);
    if (error) {
      setError(error);
    } else {
      setIntegration(null);
      setLeagueUrl('');
      setTeamQuery('');
      setTeamName('');
      setLeagueName('');
      setMatchup(null);
    }
    setIsRemoving(false);
  };

  return (
    <main className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Ottoneu</CardTitle>
          <CardDescription>
            {integration
              ? `Connected to ${teamName || 'your team'} in ${leagueName || 'your league'}`
              : 'Enter your league URL and team name to connect.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="league-url">League URL</Label>
                <Input
                  id="league-url"
                  type="url"
                  value={leagueUrl}
                  onChange={(e) => setLeagueUrl(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="team-name">Team Name</Label>
                <Input
                  id="team-name"
                  value={teamQuery}
                  onChange={(e) => setTeamQuery(e.target.value)}
                  required
                />
              </div>
              <Button type="submit">Connect</Button>
            </form>
          ) : (
            <Button onClick={handleRemove} disabled={isRemoving} variant="destructive">
              {isRemoving ? 'Removing...' : 'Remove Integration'}
            </Button>
          )}
          {matchup && (
            <div className="mt-4 text-sm">
              <p>Week {matchup.week} vs {matchup.opponentName}</p>
              <p className="font-semibold">{matchup.teamScore.toFixed(2)} - {matchup.opponentScore.toFixed(2)}</p>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}

