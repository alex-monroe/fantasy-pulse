'use client';

import { useState, useEffect, FormEvent } from 'react';
import { connectOttoneu, getOttoneuIntegration, removeOttoneuIntegration, getTeams } from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * The page for managing the Ottoneu integration.
 */
export default function OttoneuPage() {
  const [teamUrl, setTeamUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [integration, setIntegration] = useState<any | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const checkIntegration = async () => {
      const { integration, error } = await getOttoneuIntegration();
      if (error) {
        setError(error);
      } else if (integration) {
        setIntegration(integration);
        const { teams } = await getTeams(integration.id);
        if (teams) setTeams(teams);
      }
      setLoading(false);
    };
    checkIntegration();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const { integration, error } = await connectOttoneu(teamUrl);
    if (error) {
      setError(error);
      return;
    }
    if (integration) {
      setIntegration(integration);
      const { teams } = await getTeams(integration.id);
      if (teams) setTeams(teams);
    }
  };

  const handleRemove = async () => {
    if (!integration) return;
    setIsRemoving(true);
    const { success, error } = await removeOttoneuIntegration(integration.id);
    setIsRemoving(false);
    if (error) {
      setError(error);
    } else if (success) {
      setIntegration(null);
      setTeams([]);
      setTeamUrl('');
    }
  };

  if (loading) {
    return <p className="p-4">Loading...</p>;
  }

  return (
    <main className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Ottoneu</CardTitle>
          <CardDescription>
            Connect your Ottoneu fantasy team by providing your public team link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {integration ? (
            <div className="space-y-4">
              {teams.length > 0 && <p>Connected team: {teams[0].name}</p>}
              <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
                Remove Integration
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="teamUrl">Ottoneu Team URL</Label>
                <Input
                  id="teamUrl"
                  value={teamUrl}
                  onChange={(e) => setTeamUrl(e.target.value)}
                  placeholder="https://ottoneu.fangraphs.com/football/309/team/2514"
                />
              </div>
              {error && <p className="text-destructive">{error}</p>}
              <Button type="submit">Connect</Button>
            </form>
          )}
          {integration && error && <p className="text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
