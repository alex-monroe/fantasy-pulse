'use client';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Goal, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { Team, Player, GroupedPlayer } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Badge } from "@/components/ui/badge";
import { PlayerCard } from '@/components/player-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
function AppContent({ onSignOut, teams }: { onSignOut: () => void, teams: Team[] }) {
  const colors = ['#f87171', '#60a5fa', '#facc15', '#4ade80', '#a78bfa', '#f472b6'];

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
          if (!existingPlayer.matchupColors.includes(color)) {
            existingPlayer.matchupColors.push(color);
          }
        } else {
          existingPlayers.set(key, { ...player, count: 1, matchupColors: [color] });
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

  const myStarters = myPlayers.filter(p => !p.on_bench);
  const myBench = myPlayers.filter(p => p.on_bench);
  const opponentStarters = opponentPlayers.filter(p => !p.on_bench);
  const opponentBench = opponentPlayers.filter(p => p.on_bench);

  const myPlayersByPosition = groupPlayersByPosition(myStarters);
  const opponentPlayersByPosition = groupPlayersByPosition(opponentStarters);
  const positions = ['QB', 'WR', 'RB', 'TE', 'Other'];

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-primary hover:bg-primary/10">
              <Goal className="h-8 w-8" />
            </Button>
            <div className='group-data-[collapsible=icon]:hidden'>
              <h1 className="text-xl font-semibold whitespace-nowrap">Roster Loom</h1>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
            <div className='p-2'>
                <Link href="/integrations">
                  <Button variant="outline" className="w-full justify-start gap-2">
                      <PlusCircle />
                      <span className="group-data-[collapsible=icon]:hidden">Add League</span>
                  </Button>
                </Link>
            </div>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6")}>
            <SidebarTrigger />
            <div className="flex-1">
                <h2 className="text-xl font-semibold">Matchup Overview</h2>
            </div>
            <Button variant="outline" onClick={onSignOut}>Sign Out</Button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8">
             <Card>
                <CardHeader>
                    <CardTitle>Weekly Matchups</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
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

            <div className="grid grid-cols-2 gap-4 items-start">
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
      </SidebarInset>
    </>
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

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <SidebarProvider>
      <AppContent onSignOut={handleSignOut} teams={teams} />
    </SidebarProvider>
  );
}
