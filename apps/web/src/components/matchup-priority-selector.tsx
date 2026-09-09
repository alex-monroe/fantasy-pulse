'use client';

import { Button } from '@/components/ui/button';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { getTeamKey, type Team } from '@roster-loom/core';
import { ChevronDown, ChevronUp, ListFilter } from 'lucide-react';

function getTeamOpponentName(team: Team): string {
    return team.opponent?.name ?? 'Opponent';
}

type MatchupPrioritySelectorProps = {
    /** The teams, already in priority order. */
    teams: Team[];
    /** {@link getTeamKey} -> matchup color, shared with the scoreboard. */
    teamColors: Map<string, string>;
    /** Called with the reordered team keys. */
    onPriorityChange: (order: string[]) => void;
};

export function MatchupPrioritySelector({ teams, teamColors, onPriorityChange }: MatchupPrioritySelectorProps) {
    if (teams.length <= 1) {
        return null;
    }

    const teamKeys = teams.map((team, index) => getTeamKey(team, index));

    const handleMove = (teamKey: string, direction: -1 | 1) => {
        const order = [...teamKeys];
        const currentIndex = order.indexOf(teamKey);
        if (currentIndex === -1) {
            return;
        }

        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= order.length) {
            return;
        }

        const updatedOrder = [...order];
        const [moved] = updatedOrder.splice(currentIndex, 1);
        updatedOrder.splice(newIndex, 0, moved);
        onPriorityChange(updatedOrder);
    };

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                    <ListFilter className="h-4 w-4" />
                    <span className="hidden sm:inline">Matchup priority</span>
                    <span className="sm:hidden">Priority</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col gap-6 sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Matchup priority</SheetTitle>
                    <SheetDescription>
                        When a player appears in multiple matchups, their score comes from the highest priority matchup in this
                        list.
                    </SheetDescription>
                </SheetHeader>
                <div className="space-y-2">
                    {teams.map((team, index) => {
                        const teamKey = teamKeys[index];
                        const color = teamColors.get(teamKey) ?? '#6b7280';
                        return (
                            <div
                                key={teamKey}
                                className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background text-sm font-medium text-muted-foreground">
                                        {index + 1}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="h-2.5 w-2.5 rounded-full"
                                            style={{ backgroundColor: color }}
                                            aria-hidden="true"
                                        />
                                        <div>
                                            <p className="text-sm font-medium leading-none">{team.name}</p>
                                            <p className="text-xs text-muted-foreground">vs {getTeamOpponentName(team)}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleMove(teamKey, -1)}
                                        disabled={index === 0}
                                        aria-label={`Increase priority for ${team.name}`}
                                    >
                                        <ChevronUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => handleMove(teamKey, 1)}
                                        disabled={index === teams.length - 1}
                                        aria-label={`Decrease priority for ${team.name}`}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </SheetContent>
        </Sheet>
    );
}
