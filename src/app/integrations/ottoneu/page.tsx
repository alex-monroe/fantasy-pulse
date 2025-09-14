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
  const [teamUrl, setTeamUrl] = useState('');
  const [integration, setIntegration] = useState<any | null>(null);
  const [teamName, setTeamName] = useState('');
  const [leagueName, setLeagueName] = useState('');
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
          }
        }
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { teamName, leagueName, error } = await connectOttoneu(teamUrl);
    if (error) {
      setError(error);
      return;
    }
    setTeamName(teamName);
    setLeagueName(leagueName);
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
      setTeamUrl('');
      setTeamName('');
      setLeagueName('');
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
              : 'Enter your public team URL to connect.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="team-url">Team URL</Label>
                <Input
                  id="team-url"
                  type="url"
                  value={teamUrl}
                  onChange={(e) => setTeamUrl(e.target.value)}
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
          {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}

