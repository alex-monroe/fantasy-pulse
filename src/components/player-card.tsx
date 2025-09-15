'use client';

import type { GroupedPlayer } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { User, Users } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/**
 * A card that displays information about a player.
 * @param player - The player to display.
 * @returns A card that displays information about a player.
 */
export function PlayerCard({ player }: { player: GroupedPlayer }) {
    return (
        <TooltipProvider>
            <Card className="flex items-center p-1 sm:p-2 shadow-sm hover:shadow-primary/10 transition-shadow duration-300 text-sm">
                <Image src={player.imageUrl} alt={player.name} width={40} height={40} data-ai-hint="player portrait" className="rounded-full border hidden sm:block" />
                <div className="flex-1 mx-2 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-xs sm:text-sm font-semibold leading-tight">{player.name}</p>
                        {player.isDoubleAgent && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span
                                        data-testid="double-agent-badge"
                                        aria-label="Also rostered by opponents this week"
                                        tabIndex={0}
                                        className={cn(
                                            badgeVariants({ variant: "secondary" }),
                                            "gap-1 px-1.5 py-0.5 text-[10px] sm:text-xs"
                                        )}
                                    >
                                        <span role="img" aria-hidden="true" className="text-sm leading-none">
                                            🕵️
                                        </span>
                                        <span className="sr-only">Double agent</span>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Also rostered by opponents this week</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                        <div className="flex items-center gap-1">
                            {player.matchupColors.map((color, index) => (
                                <div key={index} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            ))}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{player.position} - {player.realTeam}</p>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground mr-2">
                    {player.onUserTeams > 0 && (
                        <Tooltip>
                            <TooltipTrigger>
                                <div className="flex items-center gap-1">
                                    <User className="w-3.5 h-3.5" />
                                    <span className="text-xs">{player.onUserTeams}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>On {player.onUserTeams} of your teams</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                    {player.onOpponentTeams > 0 && (
                         <Tooltip>
                            <TooltipTrigger>
                                <div className="flex items-center gap-1">
                                    <Users className="w-3.5 h-3.5" />
                                    <span className="text-xs">{player.onOpponentTeams}</span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>On {player.onOpponentTeams} opponent teams</p>
                            </TooltipContent>
                        </Tooltip>
                    )}
                </div>
                 <div className="text-right">
                    <p className="text-sm sm:text-base lg:text-xl font-bold text-foreground">
                        {player.score.toFixed(1)}
                    </p>
                </div>
            </Card>
        </TooltipProvider>
    );
}
