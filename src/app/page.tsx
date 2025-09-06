'use client';

import { useState } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Goal, PlusCircle, LayoutGrid } from 'lucide-react';
import { mockTeams } from '@/lib/mock-data';
import type { Team } from '@/lib/types';
import { TeamOverview } from '@/components/team-overview';
import { IntegrationStatus } from '@/components/integration-status';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

function AppContent() {
  const [selectedTeamId, setSelectedTeamId] = useState<number>(mockTeams[0].id);
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar() as any;

  const selectedTeam = mockTeams.find(t => t.id === selectedTeamId);
  
  const handleTeamSelect = (id: number) => {
    setSelectedTeamId(id);
    if (isMobile) {
      setOpenMobile(false);
    }
  }

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
            {mockTeams.map((team: Team) => (
              <SidebarMenuItem key={team.id}>
                <SidebarMenuButton
                  onClick={() => handleTeamSelect(team.id)}
                  isActive={selectedTeamId === team.id}
                  tooltip={{ children: team.name, side: 'right', align: 'center' }}
                >
                  <LayoutGrid />
                  <span>{team.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className='p-4'>
          <Button variant="outline" className="w-full justify-start group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:h-10 group-data-[collapsible=icon]:p-2">
            <PlusCircle />
            <span className='group-data-[collapsible=icon]:hidden pl-2'>Add Team</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className={cn("sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6")}>
            <SidebarTrigger className={cn('md:hidden', isMobile === undefined && "hidden")} />
            <div className="flex-1">
                <h2 className="text-xl font-semibold">{selectedTeam?.name || 'Dashboard'}</h2>
            </div>
        </header>
        <main className="p-4 sm:p-6 md:p-8 space-y-8">
            <div className="grid gap-8 xl:grid-cols-5">
                <div className="xl:col-span-3">
                    {selectedTeam ? <TeamOverview team={selectedTeam} /> : <p>Select a team to view details.</p>}
                </div>
                <div className="xl:col-span-2 space-y-8">
                    <IntegrationStatus />
                </div>
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
