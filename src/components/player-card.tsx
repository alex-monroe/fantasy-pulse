'use client';

import type { Player } from "@/lib/types";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { User, Users } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
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
        setCurrentScore(player.score);
        const interval = setInterval(() => {
            const scoreChange = Math.random() > 0.9 ? (Math.random() * 7).toFixed(1) : 0;
            if (scoreChange > 0 && player.gameStatus === 'possession') {
                setCurrentScore(prev => parseFloat((prev + parseFloat(scoreChange.toString())).toFixed(1)));
                setScoreChanged(true);
                setTimeout(() => setScoreChanged(false), 1000);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [player]);

    const statusInfo = useMemo(() => gameStatusConfig[player.gameStatus], [player.gameStatus]);

    return (
        <Card className="flex items-center p-2 shadow-sm hover:shadow-primary/10 transition-shadow duration-300 text-sm">
            <Image src={player.imageUrl} alt={player.name} width={40} height={40} data-ai-hint="player portrait" className="rounded-full border" />
            <div className="flex-1 mx-3">
                <p className="font-semibold leading-tight">{player.name}</p>
                <p className="text-xs text-muted-foreground">{player.position} - {player.realTeam}</p>
            </div>
             <div className="text-right">
                <p className={cn(
                    "text-xl font-bold transition-all duration-500",
                    scoreChanged ? 'text-accent scale-110' : 'text-foreground'
                )}>
                    {currentScore.toFixed(1)}
                </p>
                <Badge variant="outline" className={cn("capitalize text-xs h-5 mt-0.5", statusInfo.className)}>
                    {statusInfo.text}
                </Badge>
            </div>
        </Card>
    );
}
