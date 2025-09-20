'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { Team, Player, GroupedPlayer } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Badge } from '@/components/ui/badge';
import { PlayerCard } from '@/components/player-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AppNavigation } from '@/components/app-navigation';

/**
 * Groups a list of players by their position.
 *
 * @param players - The list of players to group.
 * @returns An object where the keys are the positions and the values are the lists of players.
 */
const groupPlayersByPosition = (players: GroupedPlayer[]): { [key: string]: GroupedPlayer[] } => {
  const positions = ['QB', 'WR', 'RB', 'TE'];
  const grouped: { [key: string]: GroupedPlayer[] } = {
    'QB': [],
    'WR': [],
    'RB': [],
    'TE': [],
    'Other': [],
  };

  players.forEach(player => {
    if (player && typeof player.position === 'string') {
      const position = player.position.toUpperCase();
      if (positions.includes(position)) {
        grouped[position].push(player);
      } else {
        grouped['Other'].push(player);
      }
    }
  });

  return grouped;
};

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
  const colors = ['#f87171', '#60a5fa', '#facc15', '#4ade80', '#a78bfa', '#f472b6'];

  const addMatchupColor = (
    matchupColors: GroupedPlayer['matchupColors'],
    color: string,
    onBench: boolean
  ) => {
    const existingMatchup = matchupColors.find((matchup) => matchup.color === color);
    if (existingMatchup) {
      existingMatchup.onBench = existingMatchup.onBench && onBench;
    } else {
      matchupColors.push({ color, onBench });
    }
  };

  const groupPlayers = (
    players: Player[],
    existingPlayers: Map<string, GroupedPlayer>,
    color: string
  ) => {
    players.forEach(player => {
      if (player && player.name && player.realTeam) {
        const key = `${player.name.toLowerCase()}-${player.realTeam.toLowerCase()}`;
        if (existingPlayers.has(key)) {
          const existingPlayer = existingPlayers.get(key)!;
          existingPlayer.count++;
          addMatchupColor(existingPlayer.matchupColors, color, player.onBench);
        } else {
          existingPlayers.set(key, {
            ...player,
            count: 1,
            matchupColors: [{ color, onBench: player.onBench }],
          });
        }
      }
    });
  };

  const myPlayersMap = new Map<string, GroupedPlayer>();
  const opponentPlayersMap = new Map<string, GroupedPlayer>();

  teams.forEach((team, index) => {
    const color = colors[index % colors.length];
    groupPlayers(team.players, myPlayersMap, color);
    groupPlayers(team.opponent.players, opponentPlayersMap, color);
  });

  const myPlayers = Array.from(myPlayersMap.values());
  const opponentPlayers = Array.from(opponentPlayersMap.values());

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

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavigation
        endContent={(
          <div className="flex items-center gap-2">
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
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8">
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
                <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    {teams.map((team, index) => (
                        <Card key={team.id} className="p-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                                    <div>
                                        <p className="font-semibold">{team.name}</p>
                                        <p className="text-sm text-muted-foreground">vs {team.opponent.name}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-primary">{(team.totalScore ?? 0).toFixed(1)}</p>
                                    <p className="font-bold text-lg text-muted-foreground">{(team.opponent?.totalScore ?? 0).toFixed(1)}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </CardContent>
             </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
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
                                    <PlayerCard key={`my-player-${player.id}-${player.name}`} player={player} />
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
                                            <PlayerCard key={`my-bench-${player.id}-${player.name}`} player={player} />
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
                                    <PlayerCard key={`opponent-player-${player.id}-${player.name}`} player={player} />
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
                                            <PlayerCard key={`opponent-bench-${player.id}-${player.name}`} player={player} />
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
