'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Team } from '@/lib/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

function getTeamOpponentName(team: Team): string {
    return team.opponent?.name ?? 'Opponent';
}

type MatchupPrioritySelectorProps = {
    teams: Team[];
    teamColors: Map<number, string>;
    onPriorityChange: (order: number[]) => void;
};

export function MatchupPrioritySelector({ teams, teamColors, onPriorityChange }: MatchupPrioritySelectorProps) {
    if (teams.length <= 1) {
        return null;
    }

    const handleMove = (teamId: number, direction: -1 | 1) => {
        const order = teams.map((team) => team.id);
        const currentIndex = order.indexOf(teamId);
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
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg">Matchup priority</CardTitle>
                <CardDescription>
                    When a player appears in more than one matchup, their score will be taken from the highest priority matchup in
                    this list.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {teams.map((team, index) => {
                    const color = teamColors.get(team.id) ?? '#6b7280';
                    return (
                        <div
                            key={team.id}
                            className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-sm font-medium text-muted-foreground border">
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
                                    onClick={() => handleMove(team.id, -1)}
                                    disabled={index === 0}
                                    aria-label={`Increase priority for ${team.name}`}
                                >
                                    <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleMove(team.id, 1)}
                                    disabled={index === teams.length - 1}
                                    aria-label={`Decrease priority for ${team.name}`}
                                >
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
