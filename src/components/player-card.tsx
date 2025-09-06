'use client';

import type { Player } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { User, Users, Zap } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { Skeleton } from "./ui/skeleton";
import { cn } from "@/lib/utils";

const gameStatusConfig = {
    possession: { text: 'Possession', className: 'bg-primary/20 text-primary-foreground border-primary' },
    sidelines: { text: 'Sidelines', className: 'bg-secondary' },
    final: { text: 'Final', className: 'bg-muted text-muted-foreground' },
    pregame: { text: 'Pregame', className: 'bg-accent/20 text-accent-foreground border-accent' },
};

export function PlayerCard({ player }: { player: Player }) {
    const [currentScore, setCurrentScore] = useState(player.score);
    const [scoreChanged, setScoreChanged] = useState(false);

    useEffect(() => {
        // Reset state when player changes
        setCurrentScore(player.score);

        // Simulate live score updates
        const interval = setInterval(() => {
            const scoreChange = Math.random() > 0.9 ? (Math.random() * 7).toFixed(1) : 0;
            if (scoreChange > 0 && player.gameStatus === 'possession') {
                setCurrentScore(prev => parseFloat((prev + parseFloat(scoreChange.toString())).toFixed(1)));
                setScoreChanged(true);
                setTimeout(() => setScoreChanged(false), 1000); // Animation duration
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [player]);

    const statusInfo = useMemo(() => gameStatusConfig[player.gameStatus], [player.gameStatus]);

    return (
        <Card className="flex flex-col shadow-lg hover:shadow-primary/20 transition-shadow duration-300">
            <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-2">
                <Image src={player.imageUrl} alt={player.name} width={64} height={64} data-ai-hint="player portrait" className="rounded-full border-2 border-primary/50" />
                <div className="flex-1">
                    <CardTitle className="text-lg leading-tight">{player.name}</CardTitle>
                    <CardDescription>{player.position} - {player.realTeam}</CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                        {player.onUserTeams > 0 && (
                            <Badge variant="secondary" className="gap-1 pl-1.5 pr-2 border border-transparent">
                                <User className="h-3 w-3" />
                                {player.onUserTeams}
                            </Badge>
                        )}
                        {player.onOpponentTeams > 0 && (
                            <Badge variant="destructive" className="gap-1 pl-1.5 pr-2 border border-transparent">
                                <Users className="h-3 w-3" />
                                {player.onOpponentTeams}
                            </Badge>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 pt-4">
                <div className="flex items-baseline justify-between">
                    <p className="text-sm text-muted-foreground">Live Score</p>
                    <p className={cn(
                        "text-4xl font-bold text-right transition-all duration-500",
                        scoreChanged ? 'text-accent scale-125' : 'text-foreground'
                    )}>
                        {currentScore.toFixed(1)}
                    </p>
                </div>
                <div className="flex items-center justify-between">
                     <p className="text-sm text-muted-foreground">Game Status</p>
                    <Badge variant="outline" className={cn("capitalize", statusInfo.className)}>
                        {statusInfo.text}
                    </Badge>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-2 pt-4 border-t bg-black/10">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Zap className="h-4 w-4 text-accent" />
                    <span>Game Details</span>
                </div>
                <div className="text-sm text-foreground space-y-1">
                    <p>Score: {player.gameDetails.score}</p>
                    <p>Time: {player.gameDetails.timeRemaining}</p>
                    <p>Position: {player.gameDetails.fieldPosition}</p>
                </div>
            </CardFooter>
        </Card>
    );
}
