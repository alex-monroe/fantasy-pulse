"use client";

import { PlayerCard } from "@/components/player-card";
import { Player } from "@/lib/types";

export function PlayerGroup({
  title,
  players,
}: {
  title: string;
  players: Player[];
}) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-bold tracking-tight mb-2">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {players.map((player) => (
          <PlayerCard player={player} key={player.player_id} />
        ))}
      </div>
    </div>
  );
}
