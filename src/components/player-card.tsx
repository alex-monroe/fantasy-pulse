'use client';

import type { GroupedPlayer } from "@/lib/types";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { User, Users } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function formatKickoffTime(gameStartTime: string | null): string | null {
  if (!gameStartTime) {
    return null;
  }

  const kickoffDate = new Date(gameStartTime);
  if (Number.isNaN(kickoffDate.getTime())) {
    return null;
  }

  try {
    const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(kickoffDate);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(kickoffDate);
    return `${day} ${time}`;
  } catch {
    return null;
  }
}

export function getGameStatusLabel(player: GroupedPlayer): string | null {
  const status = player.gameStatus?.toLowerCase?.() ?? '';

  if ((status === 'pregame' || status === 'pre') && player.gameStartTime) {
    return formatKickoffTime(player.gameStartTime);
  }

  if (status === 'in_progress' || status === 'in' || status === 'in-progress') {
    const quarter = player.gameQuarter?.trim() || null;
    const clock = player.gameClock?.trim() || null;
    if (quarter || clock) {
      return [quarter, clock].filter(Boolean).join(' ').trim();
    }
  }

  if (status === 'final' || status === 'post') {
    const detail = player.gameQuarter?.trim();
    return detail && detail.length > 0 ? detail : 'Final';
  }

  return null;
}

export function getGamePercentRemaining(player: GroupedPlayer): number | null {
  const status = player.gameStatus?.toLowerCase?.() ?? '';
  if (status !== 'in_progress' && status !== 'in' && status !== 'in-progress') {
    return null;
  }

  const quarterRaw = player.gameQuarter?.trim() ?? '';
  const quarterMatch = quarterRaw.match(/(\d+)/);
  if (!quarterMatch) {
    return null;
  }

  const quarterNumber = Number.parseInt(quarterMatch[1], 10);
  if (Number.isNaN(quarterNumber) || quarterNumber <= 0) {
    return null;
  }

  const minutesPerQuarter = 15;
  const totalQuarters = 4;
  const totalMinutes = minutesPerQuarter * totalQuarters;

  const normalizedQuarter = Math.min(Math.max(quarterNumber, 1), totalQuarters);
  const remainingFullQuarters = Math.max(0, totalQuarters - normalizedQuarter);

  const clockRaw = player.gameClock?.trim() ?? '';
  const clockMatch = clockRaw.match(/^(\d{1,2}):(\d{2})$/);
  let minutesRemainingInCurrentQuarter = 0;
  if (clockMatch) {
    const minutes = Number.parseInt(clockMatch[1], 10);
    const seconds = Number.parseInt(clockMatch[2], 10);
    if (!Number.isNaN(minutes) && minutes >= 0 && !Number.isNaN(seconds) && seconds >= 0) {
      minutesRemainingInCurrentQuarter = minutes + seconds / 60;
    }
  }

  const remainingMinutes = remainingFullQuarters * minutesPerQuarter + minutesRemainingInCurrentQuarter;
  const percentageRemaining = (remainingMinutes / totalMinutes) * 100;

  return Math.max(0, Math.min(100, percentageRemaining));
}

/**
 * A card that displays information about a player.
 * @param player - The player to display.
 * @returns A card that displays information about a player.
 */
export function PlayerCard({ player }: { player: GroupedPlayer }) {
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
                    "relative overflow-hidden p-1 sm:p-2 shadow-sm hover:shadow-primary/10 transition-shadow duration-300 text-sm",
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
                    <Image src={player.imageUrl} alt={player.name} width={40} height={40} data-ai-hint="player portrait" className="rounded-full border hidden sm:block" />
                    <div className="flex-1 mx-2 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-xs sm:text-sm font-semibold leading-tight">{player.name}</p>
                            {player.onBench && <Badge variant="secondary">BN</Badge>}
                            <div className="flex items-center gap-1">
                                {matchupColors.map((matchup, index) => (
                                    <div
                                        key={`${matchup.color}-${index}`}
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: matchup.color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{player.position} - {player.realTeam}</p>
                        {statusLabel && (
                            <p className="text-xs text-muted-foreground mt-0.5">{statusLabel}</p>
                        )}
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
                </div>
            </Card>
        </TooltipProvider>
    );
}
