'use client';

import type { Player } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { User, Users } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/**
 * A card that displays information about a player.
 * @param player - The player to display.
 * @returns A card that displays information about a player.
 */
export function PlayerCard({ player }: { player: Player & { count?: number } }) {
    return (
        <TooltipProvider>
            <Card className="flex items-center p-2 shadow-sm hover:shadow-primary/10 transition-shadow duration-300 text-sm">
                <Image src={player.imageUrl} alt={player.name} width={40} height={40} data-ai-hint="player portrait" className="rounded-full border" />
                <div className="flex-1 mx-3">
                    <p className="font-semibold leading-tight">{player.name}</p>
                    <p className="text-xs text-muted-foreground">{player.position} - {player.realTeam}</p>
                </div>
                {player.count && player.count > 1 && (
                    <Badge variant="secondary" className="mr-2">
                        {player.count}
                    </Badge>
                )}
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
                    <p className="text-xl font-bold text-foreground">
                        {player.score.toFixed(1)}
                    </p>
                </div>
            </Card>
        </TooltipProvider>
    );
}
