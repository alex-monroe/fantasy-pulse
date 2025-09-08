"use client";

import { PlayerCard } from "@/components/player-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { League, Player, Rosters } from "@/lib/types";
import { PlayerGroup } from "./player-group";

export function Roster({
  roster,
  league,
}: {
  roster: Rosters;
  league: League;
}) {
  const groupedPlayers = roster.players.reduce((groups, player) => {
    const position = player.position;
    if (!groups[position]) {
      groups[position] = [];
    }
    groups[position].push(player);
    return groups;
  }, {} as Record<string, Player[]>);

  const positionOrder = ["QB", "WR", "RB", "TE"];

  const sortedGroupedPlayers = positionOrder.map((position) => ({
    position,
    players: groupedPlayers[position] || [],
  }));

  const otherPlayers = Object.entries(groupedPlayers)
    .filter(([position]) => !positionOrder.includes(position))
    .flatMap(([, players]) => players);

  if (otherPlayers.length > 0) {
    sortedGroupedPlayers.push({
      position: "Others",
      players: otherPlayers,
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-4">
          <Avatar>
            <AvatarImage src={league.avatar} />
            <AvatarFallback>
              {league.name.substring(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <CardTitle>{league.name}</CardTitle>
        </div>
        <div className="flex flex-col">
          <CardDescription>
            {roster.metadata.record} | {roster.metadata.total_points} points
          </CardDescription>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="p-4">
        {sortedGroupedPlayers.map(
          ({ position, players }) =>
            players.length > 0 && (
              <PlayerGroup
                key={position}
                title={position}
                players={players}
              />
            )
        )}
      </CardContent>
    </Card>
  );
}
