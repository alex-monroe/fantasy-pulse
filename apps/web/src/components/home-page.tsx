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
      <div className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto px-2 py-2 sm:px-4 md:px-6">
          {teams.map((team, index) => {
            const color = teamColors.get(team.id) ?? MATCHUP_COLORS[index % MATCHUP_COLORS.length];
            const teamScoreKey = `team-${team.id}-total`;
            const opponentScoreKey = `team-${team.id}-opponent`;
            return (
              <div
                key={team.id}
                className="flex min-w-[200px] flex-shrink-0 items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
              >
                <div className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs font-medium leading-tight">{team.name}</p>
                    <p className="text-base font-bold leading-tight text-primary">
                      <span className={cn('inline-block', changedTeamScoreKeys.has(teamScoreKey) && 'score-celebrate')}>
                        {(team.totalScore ?? 0).toFixed(1)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground leading-tight">{team.opponent?.name ?? 'Opponent'}</p>
                    <p className="text-base font-bold leading-tight text-muted-foreground">
                      <span className={cn('inline-block', changedTeamScoreKeys.has(opponentScoreKey) && 'score-celebrate')}>
                        {(team.opponent?.totalScore ?? 0).toFixed(1)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-2 sm:p-4 md:p-6 space-y-2">
          {refreshError && (
            <Alert variant="destructive">
              <AlertTitle>Refresh failed</AlertTitle>
              <AlertDescription>{refreshError}</AlertDescription>
            </Alert>
          )}

            <div className="grid grid-cols-2 gap-2 sm:gap-3 items-start">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between p-2.5 sm:p-3">
                        <CardTitle className="text-sm font-semibold sm:text-base">My Players</CardTitle>
                        <Badge variant="secondary" className="ml-2">{myPlayers.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2.5 p-2 pt-0 sm:p-3 sm:pt-0">
                        {positions.map(position => (
                          myPlayersByPosition[position].length > 0 && (
                            <div key={position}>
                              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{position}</h3>
                              <div className="space-y-1">
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
                                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bench</h3>
                                <div className="space-y-1">
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
                    <CardHeader className="flex flex-row items-center justify-between p-2.5 sm:p-3">
                        <CardTitle className="text-sm font-semibold sm:text-base">Opponent Players</CardTitle>
                        <Badge variant="secondary" className="ml-2">{opponentPlayers.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2.5 p-2 pt-0 sm:p-3 sm:pt-0">
                        {positions.map(position => (
                          opponentPlayersByPosition[position].length > 0 && (
                            <div key={position}>
                              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{position}</h3>
                              <div className="space-y-1">
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
                                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Bench</h3>
                                <div className="space-y-1">
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
export default function HomePage({ teams, user, demo = false }: { teams: Team[], user: any, demo?: boolean }) {
  const router = useRouter();
  const [currentTeams, setCurrentTeams] = useState<Team[]>(teams);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);

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
    if (isRefreshingRef.current) {
      return;
    }
    isRefreshingRef.current = true;
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
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  };

  // In demo mode, poll the same refresh path every 30s so scores and game
  // clocks visibly advance — mirroring a live Sunday — and exercise the
  // score-change animations.
  const handleRefreshRef = useRef(handleRefresh);
  handleRefreshRef.current = handleRefresh;
  useEffect(() => {
    if (!demo) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void handleRefreshRef.current();
    }, 30000);
    return () => window.clearInterval(intervalId);
  }, [demo]);

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
