import type { ViewingGuideGame, ViewingGuideSlot } from "@roster-loom/core";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const formatSlotTime = (startTime: string | null): string => {
  if (!startTime) return "Time TBD";
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return "Time TBD";
  const day = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} ${time}`;
};

export const GameCard = ({ game }: { game: ViewingGuideGame }) => (
  <Card className={cn(game.isTopPick && "border-primary ring-1 ring-primary")}>
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center justify-between gap-2 text-lg">
        <span>{game.label}</span>
        <span className="flex items-center gap-2">
          {game.live && <Badge variant="destructive">Live</Badge>}
          {game.isTopPick && <Badge>Top pick</Badge>}
          <span className="text-sm font-normal text-muted-foreground">
            {game.playerCount} {game.playerCount === 1 ? "player" : "players"}
          </span>
        </span>
      </CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="space-y-1 text-sm">
        {game.players.map((player) => (
          <li key={player.key} className="flex flex-wrap justify-between gap-x-2">
            <span>
              {player.name}{" "}
              <span className="text-muted-foreground">
                {player.position} · {player.realTeam}
              </span>
            </span>
            <span className="text-muted-foreground">
              {player.mine.length > 0 && (
                <span className="text-primary">
                  Yours ×{player.mine.length}
                </span>
              )}
              {player.mine.length > 0 && player.opponents.length > 0 && " · "}
              {player.opponents.length > 0 && (
                <span className="text-destructive">
                  Opp ×{player.opponents.length}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);

export const ViewingGuideSlots = ({ slots }: { slots: ViewingGuideSlot[] }) => {
  if (slots.length === 0) {
    return (
      <p className="text-muted-foreground">
        No games left to play for your starters this week.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {slots.map((slot) => (
        <section key={slot.startTime ?? "tbd"} className="space-y-3">
          <h2 className="text-xl font-semibold">{formatSlotTime(slot.startTime)}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {slot.games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};
