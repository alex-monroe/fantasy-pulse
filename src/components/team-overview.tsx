import type { Team } from "@/lib/types";
import { PlayerCard } from "./player-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "./ui/badge";

export function TeamOverview({ team }: { team: Team }) {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-lg border bg-card text-card-foreground p-4">
                <h2 className="text-3xl font-bold tracking-tight">{team.name}</h2>
                <div className="flex items-baseline gap-4">
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Your Score</p>
                        <p className="text-4xl font-bold text-primary">{team.totalScore.toFixed(1)}</p>
                    </div>
                     <div className="text-right">
                        <p className="text-sm text-muted-foreground">{team.opponent.name}</p>
                        <p className="text-4xl font-bold text-muted-foreground">{team.opponent.totalScore.toFixed(1)}</p>
                    </div>
                </div>
            </div>

            <Tabs defaultValue="roster" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="roster">
                        Your Roster
                        <Badge variant="secondary" className="ml-2">{team.players.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="opponent">
                        Opponent
                        <Badge variant="secondary" className="ml-2">{team.opponent.players.length}</Badge>
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="roster" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {team.players.map(player => (
                            <PlayerCard key={`${team.id}-player-${player.id}`} player={player} />
                        ))}
                    </div>
                </TabsContent>
                <TabsContent value="opponent" className="mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {team.opponent.players.map(player => (
                            <PlayerCard key={`${team.id}-opponent-${player.id}`} player={player} />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
