'use client';

import { useState, FormEvent, useEffect } from 'react';
import {
  connectSleeper,
  getSleeperLeagues,
  getSleeperIntegration,
  getLeagues,
  removeSleeperIntegration,
  getLeagueMatchups,
} from './actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Image from 'next/image';

export default function SleeperPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [integration, setIntegration] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState<any | null>(null);
  const [selectedWeek, setSelectedWeek] = useState('1');
  const [matchups, setMatchups] = useState<any[]>([]);
  const [loadingMatchups, setLoadingMatchups] = useState(false);

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

  const handleRemove = async () => {
    if (!integration) return;

    setIsRemoving(true);
    setError(null);

    const { success, error } = await removeSleeperIntegration(integration.id);

    if (error) {
      setError(error);
    } else if (success) {
      setIntegration(null);
      setLeagues([]);
      setUsername('');
      setSelectedLeague(null);
      setMatchups([]);
    }

    setIsRemoving(false);
  };

  const handleFetchMatchups = async (leagueId: string, week: string) => {
    setLoadingMatchups(true);
    setError(null);
    const { matchups, error } = await getLeagueMatchups(leagueId, week);
    if (error) {
      setError(error);
    } else {
      setMatchups(matchups || []);
    }
    setLoadingMatchups(false);
  };

  useEffect(() => {
    if (integration) {
      const fetchLeagues = async ().
        const dbResponse = await getLeagues(integration.id);
        if (dbResponse.error) {
          setError(dbResponse.error);
          return;
        }
        if (dbResponse.leagues && dbResponse.leagues.length > 0) {
          setLeagues(dbResponse.leagues);
        } else {
          const sleeperResponse = await getSleeperLeagues(integration.provider_user_id, integration.id);
          if (sleeperResponse.error) {
            setError(sleeperResponse.error);
          } else {
            setLeagues(sleeperResponse.leagues || []);
          }
        }
      };
      fetchLeagues();
    }
  }, [integration]);

  useEffect(() => {
    if (selectedLeague) {
      handleFetchMatchups(selectedLeague.league_id, selectedWeek);
    }
  }, [selectedLeague, selectedWeek]);

  if (loading) {
    return <main className="p-4">Loading...</main>;
  }

  const groupedMatchups = matchups.reduce((acc, matchup) => {
    const matchupId = matchup.matchup_id;
    if (!acc[matchupId]) {
      acc[matchupId] = [];
    }
    acc[matchupId].push(matchup);
    return acc;
  }, {});

  return (
    <main className="p-4">
      <Card>
        <CardHeader>
          <CardTitle>Connect to Sleeper</CardTitle>
          <CardDescription>
            {integration
              ? `Connected as ${integration.provider_user_id}.`
              : "Enter your Sleeper username to connect your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration ? (
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
              <Button type="submit">Connect</Button>
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
                <Button
                  key={league.league_id}
                  onClick={() => setSelectedLeague(league)}
                  variant={selectedLeague?.league_id === league.league_id ? 'default' : 'outline'}
                >
                  {league.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedLeague && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Matchups for {selectedLeague.name}</CardTitle>
            <div className="flex items-center space-x-2">
              <Label htmlFor="week-selector">Week:</Label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger id="week-selector" className="w-[180px]">
                  <SelectValue placeholder="Select a week" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((week) => (
                    <SelectItem key={week} value={String(week)}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loadingMatchups ? (
              <p>Loading matchups...</p>
            ) : (
              <div className="space-y-4">
                {Object.values(groupedMatchups).map((matchupPair: any, index: number) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {matchupPair.map((team: any) => (
                      <Card key={team.roster_id}>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Image
                              src={team.user.avatar ? `https://sleepercdn.com/avatars/thumbs/${team.user.avatar}` : 'https://via.placeholder.com/40'}
                              alt={team.user.display_name}
                              width={40}
                              height={40}
                              className="rounded-full"
                            />
                            <CardTitle>{team.user.display_name}</CardTitle>
                          </div>
                          <div className="text-2xl font-bold">{(team.points || 0).toFixed(2)}</div>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Player</TableHead>
                                <TableHead>Position</TableHead>
                                <TableHead>Team</TableHead>
                                <TableHead className="text-right">Score</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {team.players.map((player: any) => (
                                <TableRow key={player.player_id}>
                                  <TableCell>{player.first_name} {player.last_name}</TableCell>
                                  <TableCell>{player.position}</TableCell>
                                  <TableCell>{player.team}</TableCell>
                                  <TableCell className="text-right">{(player.score || 0).toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
