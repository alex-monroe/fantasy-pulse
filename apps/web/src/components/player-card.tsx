'use client';

import type { GroupedPlayer } from "@roster-loom/core";
import { getGameStatusLabel, getGamePercentRemaining } from "@roster-loom/core";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { User, Users } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Re-exported for callers (and tests) that import these helpers from the
// player-card module; the implementations live in @roster-loom/core so the
// mobile app can share them.
export { getGameStatusLabel, getGamePercentRemaining };

/**
 * A card that displays information about a player.
 * @param player - The player to display.
 * @param isScoreChanged - Indicates whether the player's score changed during the last refresh.
 * @returns A card that displays information about a player.
 */
export function PlayerCard({ player, isScoreChanged = false }: { player: GroupedPlayer; isScoreChanged?: boolean }) {
    const matchupColors = player.onBench
        ? player.matchupColors
        : player.matchupColors.filter((matchup) => !matchup.onBench);
    const statusLabel = getGameStatusLabel(player);
    const gamePercentRemaining = getGamePercentRemaining(player);
    const progressOverlayClassName =
        typeof gamePercentRemaining === 'number'
            ? cn(
                  'absolute inset-x-0 bottom-0',
                  gamePercentRemaining <= 10
                      ? 'bg-red-500/20'
                      : gamePercentRemaining <= 25
                        ? 'bg-yellow-400/20'
                        : 'bg-emerald-500/20'
              )
            : null;

    return (
        <TooltipProvider>
            <Card
                className={cn(
                    "relative overflow-hidden p-1 shadow-sm hover:shadow-primary/10 transition-shadow duration-300 text-sm",
                    { "opacity-50": player.onBench }
                )}
            >
                {typeof gamePercentRemaining === 'number' && progressOverlayClassName && (
                    <div
                        aria-hidden="true"
                        data-testid="game-progress-overlay"
                        className={progressOverlayClassName}
                        style={{ height: `${gamePercentRemaining}%` }}
                    />
                )}
                <div className="relative z-10 flex items-center">
                    <Image src={player.imageUrl} alt={player.name} width={28} height={28} data-ai-hint="player portrait" className="hidden shrink-0 rounded-full border sm:block" />
                    <div className="flex-1 mx-2 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-semibold leading-tight">{player.name}</p>
                            {player.onBench && <Badge variant="secondary" className="px-1 py-0 text-[10px] leading-tight">BN</Badge>}
                            <div className="flex items-center gap-1 shrink-0">
                                {matchupColors.map((matchup, index) => (
                                    <div
                                        key={`${matchup.color}-${index}`}
                                        className="w-1.5 h-1.5 rounded-full"
                                        style={{ backgroundColor: matchup.color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <p className="truncate text-[11px] leading-tight text-muted-foreground">
                            {player.position} - {player.realTeam}
                            {statusLabel && (
                                <>
                                    {' '}
                                    <span className="before:mr-1 before:content-['·']">{statusLabel}</span>
                                </>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground mr-1.5">
                        {player.onUserTeams > 0 && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <div className="flex items-center gap-0.5">
                                        <User className="w-3 h-3" />
                                        <span className="text-[10px]">{player.onUserTeams}</span>
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
                                    <div className="flex items-center gap-0.5">
                                        <Users className="w-3 h-3" />
                                        <span className="text-[10px]">{player.onOpponentTeams}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>On {player.onOpponentTeams} opponent teams</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-sm sm:text-base font-bold text-foreground">
                            <span className={cn('inline-block', isScoreChanged && 'score-celebrate')}>
                                {player.score.toFixed(1)}
                            </span>
                        </p>
                    </div>
                </div>
            </Card>
        </TooltipProvider>
    );
}
