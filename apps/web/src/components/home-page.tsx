'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, Users } from 'lucide-react';
import Link from 'next/link';
import {
  Team,
  Player,
  GroupedPlayer,
  MATCHUP_COLORS,
  assignTeamColors,
  createPlayerAggregationKey,
  groupMatchupPlayers,
} from '@roster-loom/core';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AppNavigation } from '@/components/app-navigation';
import { LeagueScoreboard } from '@/components/league-scoreboard';
import { MatchupPrioritySelector } from '@/components/matchup-priority-selector';
import { PlayerBoard } from '@/components/player-board';

/**
 * The main content of the application.
 *
 * @param onSignOut - The function to call when the user signs out.
 * @param teams - The list of teams to display.
 * @returns The main content of the application.
 */
function AppContent({
  demo = false,
  onSignOut,
  teams,
  onRefresh,
  isRefreshing,
  refreshError,
}: {
  demo?: boolean,
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

  const [showOpponents, setShowOpponents] = useState(true);
  const [isScoreboardCollapsed, setIsScoreboardCollapsed] = useState(false);

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

  const hasTeams = teams.length > 0;

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
              // Desktop-only: on a phone the boards stack anyway, and the
              // nav has no room for a fourth control.
              className="hidden sm:inline-flex"
              variant={showOpponents ? 'secondary' : 'outline'}
              onClick={() => setShowOpponents((previous) => !previous)}
              aria-pressed={showOpponents}
              title={showOpponents ? 'Hide opponent rosters' : 'Show opponent rosters'}
            >
              <Users className="h-4 w-4" />
              <span className="hidden lg:inline">Opponents</span>
            </Button>
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

      <LeagueScoreboard
        teams={teams}
        teamColors={teamColors}
        changedScoreKeys={changedTeamScoreKeys}
        collapsed={isScoreboardCollapsed}
        onToggleCollapsed={() => setIsScoreboardCollapsed((previous) => !previous)}
      />

      <main className="flex-1 px-2 py-3 sm:px-4 lg:px-6">
        {demo && (
          <Alert className="mb-3">
            <AlertTitle>Demo data</AlertTitle>
            <AlertDescription>
              These scores are simulated, not live. Every other part of the
              app is the real thing. See docs/DEMO_MODE.md.
            </AlertDescription>
          </Alert>
        )}
        {refreshError && (
          <Alert variant="destructive" className="mb-3">
            <AlertTitle>Refresh failed</AlertTitle>
            <AlertDescription>{refreshError}</AlertDescription>
          </Alert>
        )}

        {hasTeams ? (
          // Opponents shown: two half-width boards side by side on desktop.
          // Opponents hidden: one full-bleed board, so your own players
          // spread across every column the screen has.
          <div className={cn('grid items-start gap-5', showOpponents && 'lg:grid-cols-2 lg:gap-6')}>
            <PlayerBoard
              title="My players"
              players={myPlayers}
              width={showOpponents ? 'split' : 'wide'}
              keyPrefix="mine"
              isPlayerScoreChanged={isPlayerScoreChanged}
            />
            {showOpponents && (
              <PlayerBoard
                title="Opponents"
                tone="opponent"
                players={opponentPlayers}
                width="split"
                keyPrefix="opponent"
                isPlayerScoreChanged={isPlayerScoreChanged}
                className="lg:border-l lg:pl-6"
              />
            )}
          </div>
        ) : (
          <div className="mx-auto mt-12 max-w-md rounded-lg border border-dashed p-10 text-center">
            <h2 className="text-base font-semibold">No matchups to show</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect a Sleeper, Yahoo, ESPN, or Ottoneu league and every roster you own
              shows up here on one board.
            </p>
            <Button asChild className="mt-4">
              <Link href="/integrations">Connect a league</Link>
            </Button>
          </div>
        )}
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
export default function HomePage({
  teams,
  user,
  demo = false,
  demoInstance = false,
}: {
  teams: Team[],
  user: any,
  /** Serving demo data, from any source (env switch, cookie, or header). */
  demo?: boolean,
  /** Serving demo data because of the instance-wide DEMO_MODE env switch. */
  demoInstance?: boolean,
}) {
  const router = useRouter();
  const [currentTeams, setCurrentTeams] = useState<Team[]>(teams);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    // A DEMO_MODE=1 instance serves fake data with no account, so there is
    // nothing to send an anonymous visitor to /login for.
    if (!user && !demoInstance) {
      router.replace('/login');
    }
  }, [user, demoInstance, router]);

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
      demo={demo}
      onSignOut={handleSignOut}
      teams={currentTeams}
      onRefresh={handleRefresh}
      isRefreshing={isRefreshing}
      refreshError={refreshError}
    />
  );
}
