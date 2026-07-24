'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import {
  Team,
  Player,
  GroupedPlayer,
  MATCHUP_COLORS,
  assignTeamColors,
  createPlayerAggregationKey,
  groupMatchupPlayers,
  groupPlayersByPosition,
} from '@roster-loom/core';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Badge } from '@/components/ui/badge';
import { PlayerCard } from '@/components/player-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AppNavigation } from '@/components/app-navigation';
import { MatchupPrioritySelector } from '@/components/matchup-priority-selector';

/**
 * The main content of the application.
 *
 * @param onSignOut - The function to call when the user signs out.
 * @param teams - The list of teams to display.
 * @returns The main content of the application.
 */
function AppContent({
  onSignOut,
  teams,
  onRefresh,
  isRefreshing,
  refreshError,
}: {
  onSignOut: () => void | Promise<void>,
  teams: Team[],
  onRefresh: () => void | Promise<void>,
  isRefreshing: boolean,
  refreshError: string | null,
}) {
  const [matchupPriority, setMatchupPriority] = useState<number[]>(() => teams.map((team) => team.id));
  const [changedTeamScores, setChangedTeamScores] = useState<string[]>([]);
  const [changedPlayerScores, setChangedPlayerScores] = useState<string[]>([]);
  const previousTeamsRef = useRef<Team[] | null>(null);

  useEffect(() => {
    const previousTeams = previousTeamsRef.current;
    previousTeamsRef.current = teams;

    if (!previousTeams) {
      return;
    }

    const nextTeamChanges = new Set<string>();
    const nextPlayerChanges = new Set<string>();

    const previousTeamMap = new Map<number, Team>();
    previousTeams.forEach((team) => {
      previousTeamMap.set(team.id, team);
    });

    const buildPlayerMap = (players: Player[]) => {
      const map = new Map<string, Player>();
      players.forEach((player) => {
        const key = createPlayerAggregationKey(player);
        if (key) {
          map.set(key, player);
        }
      });
      return map;
    };

    const markChangedPlayers = (players: Player[], previousPlayerMap: Map<string, Player>) => {
      players.forEach((player) => {
        const key = createPlayerAggregationKey(player);
        if (!key) {
          return;
        }

        const previousPlayer = previousPlayerMap.get(key);
        if (!previousPlayer || previousPlayer.score !== player.score) {
          nextPlayerChanges.add(key);
        }
      });
    };

    teams.forEach((team) => {
      const teamScoreKey = `team-${team.id}-total`;
      const opponentScoreKey = `team-${team.id}-opponent`;
      const previousTeam = previousTeamMap.get(team.id);

      if (!previousTeam) {
        nextTeamChanges.add(teamScoreKey);
        nextTeamChanges.add(opponentScoreKey);
        markChangedPlayers(team.players, new Map());
        markChangedPlayers(team.opponent.players, new Map());
        return;
      }

      if (team.totalScore !== previousTeam.totalScore) {
        nextTeamChanges.add(teamScoreKey);
      }

      if ((team.opponent?.totalScore ?? 0) !== (previousTeam.opponent?.totalScore ?? 0)) {
        nextTeamChanges.add(opponentScoreKey);
      }

      const previousPlayerMap = buildPlayerMap(previousTeam.players);
      const previousOpponentPlayerMap = buildPlayerMap(previousTeam.opponent.players);

      markChangedPlayers(team.players, previousPlayerMap);
      markChangedPlayers(team.opponent.players, previousOpponentPlayerMap);
    });

    setChangedTeamScores((previousKeys) => {
      if (nextTeamChanges.size === 0) {
        return previousKeys.length > 0 ? [] : previousKeys;
      }

      const nextKeys = Array.from(nextTeamChanges);
      const previousKeySet = new Set(previousKeys);
      const isSameSize = previousKeys.length === nextKeys.length;
      const hasSameMembers = isSameSize && nextKeys.every((key) => previousKeySet.has(key));

      return hasSameMembers ? previousKeys : nextKeys;
    });

    setChangedPlayerScores((previousKeys) => {
      if (nextPlayerChanges.size === 0) {
        return previousKeys.length > 0 ? [] : previousKeys;
      }

      const nextKeys = Array.from(nextPlayerChanges);
      const previousKeySet = new Set(previousKeys);
      const isSameSize = previousKeys.length === nextKeys.length;
      const hasSameMembers = isSameSize && nextKeys.every((key) => previousKeySet.has(key));

      return hasSameMembers ? previousKeys : nextKeys;
    });
  }, [teams]);

  useEffect(() => {
    if (changedTeamScores.length === 0 && changedPlayerScores.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setChangedTeamScores([]);
      setChangedPlayerScores([]);
    }, 1600);

    return () => window.clearTimeout(timeout);
  }, [changedTeamScores, changedPlayerScores]);

  const changedTeamScoreKeys = useMemo(() => new Set(changedTeamScores), [changedTeamScores]);
  const changedPlayerScoreKeys = useMemo(() => new Set(changedPlayerScores), [changedPlayerScores]);

  useEffect(() => {
    setMatchupPriority((previousOrder) => {
      const seen = new Set<number>();
      const nextOrder: number[] = [];

      previousOrder.forEach((teamId) => {
        if (seen.has(teamId)) {
          return;
        }

        const teamExists = teams.some((team) => team.id === teamId);
        if (teamExists) {
          nextOrder.push(teamId);
          seen.add(teamId);
        }
      });

      teams.forEach((team) => {
        if (!seen.has(team.id)) {
          nextOrder.push(team.id);
          seen.add(team.id);
        }
      });

      return nextOrder;
    });
  }, [teams]);

  const priorityOrderedTeams = useMemo(() => {
    const teamById = new Map<number, Team>();
    teams.forEach((team) => {
      teamById.set(team.id, team);
    });

    const ordered: Team[] = [];
    const seen = new Set<number>();

    matchupPriority.forEach((teamId) => {
      const team = teamById.get(teamId);
      if (team && !seen.has(team.id)) {
        ordered.push(team);
        seen.add(team.id);
      }
    });

    teams.forEach((team) => {
      if (!seen.has(team.id)) {
        ordered.push(team);
        seen.add(team.id);
      }
    });

    return ordered;
  }, [teams, matchupPriority]);

  const teamColors = useMemo(() => assignTeamColors(teams, MATCHUP_COLORS), [teams]);

  const { myPlayers, opponentPlayers } = useMemo(
    () => groupMatchupPlayers(teams, { priorityOrder: matchupPriority }),
    [teams, matchupPriority]
  );

  const myStarters = myPlayers.filter(p => !p.onBench);
  const myBench = myPlayers.filter(p => p.onBench);
  const opponentStarters = opponentPlayers.filter(p => !p.onBench);
  const opponentBench = opponentPlayers.filter(p => p.onBench);

  const myPlayersByPosition = groupPlayersByPosition(myStarters);
  const opponentPlayersByPosition = groupPlayersByPosition(opponentStarters);
  const positions = ['QB', 'WR', 'RB', 'TE', 'Other'];

  const handleRefreshClick = () => {
    void onRefresh();
  };

  const handleSignOutClick = () => {
    void onSignOut();
  };

  const isPlayerScoreChanged = (player: GroupedPlayer) => {
    const key = createPlayerAggregationKey(player);
    return key ? changedPlayerScoreKeys.has(key) : false;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation
        endContent={(
          <div className="flex items-center gap-2">
            <MatchupPrioritySelector
              teams={priorityOrderedTeams}
              teamColors={teamColors}
              onPriorityChange={(order) => setMatchupPriority(order)}
            />
            <Button
              variant="outline"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" onClick={handleSignOutClick}>Sign Out</Button>
          </div>
        )}
      />
      <main className="flex-1 overflow-y-auto p-2 sm:p-6 md:p-8 space-y-8">
          <h1 className="text-2xl font-semibold tracking-tight">Matchup Overview</h1>
          {refreshError && (
            <Alert variant="destructive">
              <AlertTitle>Refresh failed</AlertTitle>
              <AlertDescription>{refreshError}</AlertDescription>
            </Alert>
          )}
          <Card>
                <CardHeader>
                    <CardTitle>Weekly Matchups</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    {teams.map((team, index) => {
                      const color = teamColors.get(team.id) ?? MATCHUP_COLORS[index % MATCHUP_COLORS.length];
                      const teamScoreKey = `team-${team.id}-total`;
                      const opponentScoreKey = `team-${team.id}-opponent`;
                      return (
                        <Card key={team.id} className="p-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                    <div>
                                        <p className="font-semibold">{team.name}</p>
                                        <p className="text-sm text-muted-foreground">vs {team.opponent?.name ?? 'Opponent'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-primary">
                                      <span className={cn('inline-block', changedTeamScoreKeys.has(teamScoreKey) && 'score-celebrate')}>
                                        {(team.totalScore ?? 0).toFixed(1)}
                                      </span>
                                    </p>
                                    <p className="font-bold text-lg text-muted-foreground">
                                      <span className={cn('inline-block', changedTeamScoreKeys.has(opponentScoreKey) && 'score-celebrate')}>
                                        {(team.opponent?.totalScore ?? 0).toFixed(1)}
                                      </span>
                                    </p>
                                </div>
                            </div>
                        </Card>
                      );
                    })}
                </CardContent>
             </Card>

            <div className="grid grid-cols-2 gap-2 sm:gap-4 items-start">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>My Players</CardTitle>
                        <Badge variant="secondary" className="ml-2">{myPlayers.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {positions.map(position => (
                          myPlayersByPosition[position].length > 0 && (
                            <div key={position}>
                              <h3 className="text-lg font-semibold tracking-tight mb-2">{position}</h3>
                              <div className="space-y-2">
                                {myPlayersByPosition[position]
                                  .sort((a, b) => b.score - a.score)
                                  .map(player => (
                                    <PlayerCard
                                      key={`my-player-${player.id}-${player.name}`}
                                      player={player}
                                      isScoreChanged={isPlayerScoreChanged(player)}
                                    />
                                  ))}
                              </div>
                            </div>
                          )
                        ))}
                        {myBench.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold tracking-tight mb-2">Bench</h3>
                                <div className="space-y-2">
                                    {myBench
                                        .sort((a, b) => b.score - a.score)
                                        .map(player => (
                                            <PlayerCard
                                              key={`my-bench-${player.id}-${player.name}`}
                                              player={player}
                                              isScoreChanged={isPlayerScoreChanged(player)}
                                            />
                                        ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Opponent Players</CardTitle>
                        <Badge variant="secondary" className="ml-2">{opponentPlayers.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {positions.map(position => (
                          opponentPlayersByPosition[position].length > 0 && (
                            <div key={position}>
                              <h3 className="text-lg font-semibold tracking-tight mb-2">{position}</h3>
                              <div className="space-y-2">
                                {opponentPlayersByPosition[position]
                                  .sort((a, b) => b.score - a.score)
                                  .map(player => (
                                    <PlayerCard
                                      key={`opponent-player-${player.id}-${player.name}`}
                                      player={player}
                                      isScoreChanged={isPlayerScoreChanged(player)}
                                    />
                                  ))}
                              </div>
                            </div>
                          )
                        ))}
                        {opponentBench.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold tracking-tight mb-2">Bench</h3>
                                <div className="space-y-2">
                                    {opponentBench
                                        .sort((a, b) => b.score - a.score)
                                        .map(player => (
                                            <PlayerCard
                                              key={`opponent-bench-${player.id}-${player.name}`}
                                              player={player}
                                              isScoreChanged={isPlayerScoreChanged(player)}
                                            />
                                        ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
      </main>
    </div>
  )
}

/**
 * The home page of the application.
 *
 * @param teams - The list of teams to display.
 * @param user - The current user.
 * @returns The home page of the application.
 */
export default function HomePage({ teams, user }: { teams: Team[], user: any }) {
  const router = useRouter();
  const [currentTeams, setCurrentTeams] = useState<Team[]>(teams);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  useEffect(() => {
    setCurrentTeams(teams);
  }, [teams]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);

    try {
      const response = await fetch('/api/teams/refresh', { method: 'POST' });

      if (!response.ok) {
        let message = 'Failed to refresh scores.';
        try {
          const errorData = await response.json();
          if (errorData?.error) {
            message = errorData.error;
          }
        } catch (error) {
          console.error('Failed to parse refresh error response', error);
        }
        setRefreshError(message);
        return;
      }

      const data = await response.json();
      setCurrentTeams(Array.isArray(data?.teams) ? data.teams : []);
    } catch (error) {
      console.error('Failed to refresh teams', error);
      setRefreshError('An unexpected error occurred while refreshing scores.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <AppContent
      onSignOut={handleSignOut}
      teams={currentTeams}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      refreshError={refreshError}
    />
  );
}
