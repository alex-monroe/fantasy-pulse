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

function AppContent({ onSignOut, teams }: { onSignOut: () => void, teams: Team[] }) {
  const groupPlayers = (players: Player[]): GroupedPlayer[] => {
    const playerMap = new Map<string, GroupedPlayer>();
    players.forEach(player => {
      if (player && player.name && player.realTeam) {
        const key = `${player.name.toLowerCase()}-${player.realTeam.toLowerCase()}`;
        if (playerMap.has(key)) {
          playerMap.get(key)!.count++;
        } else {
          playerMap.set(key, { ...player, count: 1 });
        }
      }
    });
    return Array.from(playerMap.values());
  };

  const myPlayers = groupPlayers(teams.flatMap(team => team.players));
  const opponentPlayers = teams.flatMap(team => team.opponent.players);

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-10 w-10 text-primary hover:bg-primary/10">
              <Goal className="h-8 w-8" />
            </Button>
            <div className='group-data-[collapsible=icon]:hidden'>
              <h1 className="text-xl font-semibold whitespace-nowrap">Fantasy Pulse</h1>
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
                    {teams.map(team => (
                        <Card key={team.id} className="p-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-semibold">{team.name}</p>
                                    <p className="text-sm text-muted-foreground">vs {team.opponent.name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-lg text-primary">{team.totalScore.toFixed(1)}</p>
                                    <p className="font-bold text-lg text-muted-foreground">{team.opponent.totalScore.toFixed(1)}</p>
                                </div>
                            </div>
                        </Card>
                    ))}
                </CardContent>
             </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>My Players</CardTitle>
                        <Badge variant="secondary" className="ml-2">{myPlayers.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {myPlayers.map(player => (
                            <PlayerCard key={`my-player-${player.id}`} player={player} />
                        ))}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>Opponent Players</CardTitle>
                        <Badge variant="secondary" className="ml-2">{opponentPlayers.length}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {opponentPlayers.map(player => (
                            <PlayerCard key={`opponent-player-${player.id}`} player={player} />
                        ))}
                    </CardContent>
                </Card>
            </div>
        </main>
      </SidebarInset>
    </>
  )
}

export default function HomePage({ teams }: { teams: Team[] }) {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
      }
    };
    checkUser();
  }, [router]);

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
