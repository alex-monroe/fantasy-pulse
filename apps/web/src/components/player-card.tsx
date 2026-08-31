'use client';

import type { GroupedPlayer } from "@roster-loom/core";
import {
    getGamePercentRemaining,
    getGamePhase,
    getGameStatusLabel,
    getLiveProjectedPoints,
} from "@roster-loom/core";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { Users } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// Re-exported for callers (and tests) that import these helpers from the
// player-card module; the implementations live in @roster-loom/core so the
// mobile app can share them.
export { getGameStatusLabel, getGamePercentRemaining, getLiveProjectedPoints };

/**
 * The left-edge accent that tells you, from across the room, whether a
 * player's game is live, still to come, or already in the books.
 */
const PHASE_ACCENT: Record<string, string> = {
    live: 'border-l-emerald-500',
    pregame: 'border-l-sky-500/40',
    final: 'border-l-muted-foreground/30',
    unknown: 'border-l-border',
};

/**
 * A card that displays information about a player.
 *
 * Sized for a scoreboard read at arm's length: the name and the score are
 * the two things that carry, everything else is supporting detail on a
 * single muted line underneath.
 *
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
    const liveProjectedPoints = getLiveProjectedPoints(player);
    const phase = getGamePhase(player);
    const isLive = phase === 'live';
    // A gauge down the right edge, not a wash over the whole card: with
    // sixty players on screen a full-card tint just reads as "everything
    // is green", while a 3px column still says at a glance how much
    // football each player has left.
    const progressOverlayClassName =
        typeof gamePercentRemaining === 'number'
            ? cn(
                  'absolute bottom-0 right-0 w-[3px] rounded-full',
                  gamePercentRemaining <= 10
                      ? 'bg-red-500'
                      : gamePercentRemaining <= 25
                        ? 'bg-yellow-400'
                        : 'bg-emerald-500'
              )
            : null;

    return (
        <TooltipProvider>
            <Card
                className={cn(
                    "relative overflow-hidden border-l-[3px] p-2 shadow-sm transition-shadow duration-300 hover:shadow-md hover:shadow-primary/10",
                    PHASE_ACCENT[phase] ?? PHASE_ACCENT.unknown,
                    isLive && "bg-emerald-500/[0.07]",
                    { "opacity-60": player.onBench }
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
                <div className="relative z-10 flex items-center gap-2.5 pr-1.5">
                    <Image
                        src={player.imageUrl}
                        alt={player.name}
                        width={36}
                        height={36}
                        data-ai-hint="player portrait"
                        className="hidden h-9 w-9 shrink-0 rounded-full border border-border/60 object-cover sm:block"
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-semibold leading-tight">{player.name}</p>
                            {player.onBench && (
                                <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px] leading-tight">BN</Badge>
                            )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
                            <span className="shrink-0">{player.position} · {player.realTeam}</span>
                            {statusLabel && (
                                <span
                                    className={cn(
                                        'flex min-w-0 items-center gap-1 truncate',
                                        isLive && 'font-medium text-emerald-400'
                                    )}
                                >
                                    <span aria-hidden="true" className="text-muted-foreground/50">·</span>
                                    {isLive && (
                                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                                    )}
                                    <span className="truncate">{statusLabel}</span>
                                </span>
                            )}
                            <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
                                {player.onOpponentTeams > 0 && (
                                    <Tooltip>
                                        <TooltipTrigger className="flex items-center gap-0.5 text-amber-400/90">
                                            <Users className="h-3 w-3" />
                                            <span className="text-[10px] leading-none">{player.onOpponentTeams}</span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>On {player.onOpponentTeams} opponent teams</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                <span className="flex items-center gap-1">
                                    {matchupColors.map((matchup, index) => (
                                        <span
                                            key={`${matchup.color}-${index}`}
                                            className="h-2 w-2 rounded-full ring-1 ring-inset ring-black/20"
                                            style={{ backgroundColor: matchup.color }}
                                        />
                                    ))}
                                </span>
                            </span>
                        </div>
                    </div>
                    <div className="shrink-0 text-right">
                        <p className="text-xl font-bold leading-none tabular-nums text-foreground">
                            <span className={cn('inline-block', isScoreChanged && 'score-celebrate')}>
                                {player.score.toFixed(1)}
                            </span>
                        </p>
                        {typeof liveProjectedPoints === 'number' && (
                            <p className="mt-1 text-[10px] leading-none tabular-nums text-muted-foreground">
                                Proj {liveProjectedPoints.toFixed(1)}
                            </p>
                        )}
                    </div>
                </div>
            </Card>
        </TooltipProvider>
    );
}
