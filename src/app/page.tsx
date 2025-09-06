'use client';

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Goal, Users, User, Tv } from 'lucide-react';
import { mockTeams } from '@/lib/mock-data';
import type { Player } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { Badge } from "@/components/ui/badge";
import { PlayerCard } from '@/components/player-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function AppContent() {
  const { myPlayers, opponentPlayers, myTotalScore, opponentTotalScore } = useMemo(() => {
    const myPlayersMap = new Map<number, Player>();
    const opponentPlayersMap = new Map<number, Player>();
    
    mockTeams.forEach(team => {
      team.players.forEach(player => {
        if (!myPlayersMap.has(player.id)) {
          myPlayersMap.set(player.id, player);
        }
      });

      team.opponent.players.forEach(player => {
        if (!myPlayersMap.has(player.id) && !opponentPlayersMap.has(player.id)) {
          opponentPlayersMap.set(player.id, player);
        }
      });
    });

    const myPlayers = Array.from(myPlayersMap.values()).sort((a, b) => b.score - a.score);
    const opponentPlayers = Array.from(opponentPlayersMap.values()).sort((a, b) => b.score - a.score);
    
    const myCalculatedScore = myPlayers.reduce((sum, p) => sum + p.score, 0);
    const opponentCalculatedScore = opponentPlayers.reduce((sum, p) => sum + p.score, 0);

    return { myPlayers, opponentPlayers, myTotalScore: myCalculatedScore, opponentTotalScore: opponentCalculatedScore };
  }, []);

  return (
    <>
      <Sidebar>
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
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={true}>
                <Tv />
                <span>Dashboard</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton>
                <User />
                <span>My Players</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
             <SidebarMenuItem>
              <SidebarMenuButton>
                <Users />
                <span>Opponents</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6")}>
            <div className="flex-1">
                <h2 className="text-xl font-semibold">Matchup Overview</h2>
            </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-8">
             <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-lg border bg-card text-card-foreground p-4">
                <h2 className="text-3xl font-bold tracking-tight">Weekly Matchup</h2>
                <div className="flex items-baseline gap-4">
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Your Score</p>
                        <p className="text-4xl font-bold text-primary">{myTotalScore.toFixed(1)}</p>
                    </div>
                     <div className="text-right">
                        <p className="text-sm text-muted-foreground">Opponents' Score</p>
                        <p className="text-4xl font-bold text-muted-foreground">{opponentTotalScore.toFixed(1)}</p>
                    </div>
                </div>
            </div>

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

export default function Home() {
  return (
    <SidebarProvider>
      <AppContent />
    </SidebarProvider>
  );
}
