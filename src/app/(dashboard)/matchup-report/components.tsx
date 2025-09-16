import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlayerCard as SharedPlayerCard } from "@/components/player-card";
import type { Player } from "@/lib/types";

const MatchupPlayerCard = ({
  player,
  isDoubleAgent = false,
}: {
  player: Player & {
    matchups?: string[];
    userMatchups?: string[];
    opponentMatchups?: string[];
  };
  isDoubleAgent?: boolean;
}) => {
  const groupedPlayer = {
    ...player,
    count: 1,
    matchupColors: [],
  };

  return (
    <div className="mb-2">
      <SharedPlayerCard player={groupedPlayer} />
      <div className="p-2 border-t text-sm text-muted-foreground">
        {isDoubleAgent ? (
          <>
            <div>
              <span className="font-semibold text-primary">Your teams:</span>{" "}
              {player.userMatchups?.join(", ")}
            </div>
            <div>
              <span className="font-semibold text-destructive">
                Opponent teams:
              </span>{" "}
              {player.opponentMatchups?.join(", ")}
            </div>
          </>
        ) : (
          <div>
            <span className="font-semibold">On teams:</span>{" "}
            {player.matchups?.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
};

export const FantasyHeroes = ({ players }: { players: Player[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>🦸 Fantasy Heroes</CardTitle>
    </CardHeader>
    <CardContent>
      {players
        .sort((a, b) => Number(a.on_bench) - Number(b.on_bench) || b.score - a.score)
        .map((player) => (
          <MatchupPlayerCard key={player.id} player={player} />
        ))}
    </CardContent>
  </Card>
);

export const PublicEnemies = ({ players }: { players: Player[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>😈 Public Enemies</CardTitle>
    </CardHeader>
    <CardContent>
      {players
        .sort((a, b) => Number(a.on_bench) - Number(b.on_bench) || b.score - a.score)
        .map((player) => (
          <MatchupPlayerCard key={player.id} player={player} />
        ))}
    </CardContent>
  </Card>
);

export const DoubleAgents = ({ players }: { players: Player[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>🕵️ Double Agents</CardTitle>
    </CardHeader>
    <CardContent>
      {players
        .sort((a, b) => Number(a.on_bench) - Number(b.on_bench) || b.score - a.score)
        .map((player) => (
          <MatchupPlayerCard key={player.id} player={player} isDoubleAgent />
        ))}
    </CardContent>
  </Card>
);
