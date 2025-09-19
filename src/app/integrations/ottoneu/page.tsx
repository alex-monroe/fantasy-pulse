'use client';

import { useEffect, useState, FormEvent } from 'react';
import {
  connectOttoneu,
  getOttoneuIntegration,
  removeOttoneuIntegration,
  getLeagues,
  getOttoneuTeamInfo,
  getOttoneuLeagueTeams,
} from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [isLoadingIntegration, setIsLoadingIntegration] = useState(true);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [teamOptions, setTeamOptions] = useState<string[]>([]);
  const [teamOptionsError, setTeamOptionsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { integration, error } = await getOttoneuIntegration();
      if (cancelled) return;
      if (error) {
        setError(error);
        setIsLoadingIntegration(false);
        return;
      }
      if (integration) {
        setIntegration(integration);
        const { leagues } = await getLeagues(integration.id);
        if (cancelled) return;
        if (leagues && leagues[0]) {
          setLeagueName(leagues[0].name);
          const info = await getOttoneuTeamInfo(`https://ottoneu.fangraphs.com/football/${leagues[0].league_id}/team/${integration.provider_user_id}`);
          if (cancelled) return;
          if ('teamName' in info) {
            setTeamName(info.teamName);
            setTeamQuery(info.teamName);
          }
          if ('matchup' in info) {
            setMatchup(info.matchup);
          }
        }
      }
      setIsLoadingIntegration(false);
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmedLeagueUrl = leagueUrl.trim();

    if (!trimmedLeagueUrl) {
      setTeamOptions([]);
      setTeamOptionsError(null);
      setTeamQuery('');
      setIsLoadingTeams(false);
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(trimmedLeagueUrl);
    } catch {
      setTeamOptions([]);
      setTeamOptionsError(null);
      setTeamQuery('');
      setIsLoadingTeams(false);
      return;
    }

    if (parsedUrl.hostname !== 'ottoneu.fangraphs.com') {
      setTeamOptions([]);
      setTeamOptionsError(null);
      setTeamQuery('');
      setIsLoadingTeams(false);
      return;
    }

    let cancelled = false;
    setIsLoadingTeams(true);
    setTeamOptionsError(null);
    setTeamQuery('');

    const loadTeams = async () => {
      try {
        const result = await getOttoneuLeagueTeams(parsedUrl.toString());
        if (cancelled) return;
        setIsLoadingTeams(false);
        if ('error' in result) {
          setTeamOptions([]);
          setTeamOptionsError(result.error);
          return;
        }
        setTeamOptions(result.teams);
      } catch {
        if (cancelled) return;
        setIsLoadingTeams(false);
        setTeamOptions([]);
        setTeamOptionsError('Failed to fetch league page.');
      }
    };

    loadTeams();

    return () => {
      cancelled = true;
    };
  }, [leagueUrl]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!teamQuery) {
      setError('Please select a team.');
      return;
    }
    const trimmedLeagueUrl = leagueUrl.trim();
    const { teamName, leagueName, matchup, error } = await connectOttoneu(
      trimmedLeagueUrl,
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
      setTeamOptions([]);
      setTeamOptionsError(null);
      setIsLoadingTeams(false);
      setTeamName('');
      setLeagueName('');
      setMatchup(null);
    }
    setIsRemoving(false);
  };

  if (isLoadingIntegration) {
    return <main className="p-4">Loading integration...</main>;
  }

  return (
    <main className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Ottoneu</CardTitle>
          <CardDescription>
            {integration
              ? `Connected to ${teamName || 'your team'} in ${leagueName || 'your league'}`
              : 'Enter your league URL and select your team to connect.'}
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
                <Select
                  value={teamQuery}
                  onValueChange={(value) => {
                    setTeamQuery(value);
                    setError(null);
                  }}
                  disabled={isLoadingTeams || teamOptions.length === 0}
                >
                  <SelectTrigger id="team-name">
                    <SelectValue
                      placeholder={
                        isLoadingTeams
                          ? 'Loading teams...'
                          : teamOptions.length > 0
                            ? 'Select a team'
                            : 'Enter a league URL to load teams'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {teamOptions.map((team) => (
                      <SelectItem key={team} value={team}>
                        {team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {teamOptionsError && (
                  <p className="mt-2 text-sm text-red-500">{teamOptionsError}</p>
                )}
              </div>
              <Button type="submit" disabled={!teamQuery || isLoadingTeams}>
                Connect
              </Button>
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

