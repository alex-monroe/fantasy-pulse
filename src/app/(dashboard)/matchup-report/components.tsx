import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Player = {
  id: number;
  name: string;
  matchups: string[];
  userMatchups: string[];
  opponentMatchups: string[];
};

const PlayerCard = ({
  player,
  isDoubleAgent = false,
}: {
  player: Player;
  isDoubleAgent?: boolean;
}) => (
  <div className="mb-2 p-2 border rounded">
    <h4 className="font-semibold">{player.name}</h4>
    {isDoubleAgent ? (
      <>
        <div className="text-sm">
          <span className="font-bold">Your teams:</span>{" "}
          {player.userMatchups.join(", ")}
        </div>
        <div className="text-sm">
          <span className="font-bold">Opponent teams:</span>{" "}
          {player.opponentMatchups.join(", ")}
        </div>
      </>
    ) : (
      <p className="text-sm">{player.matchups.join(", ")}</p>
    )}
  </div>
);

export const FantasyHeroes = ({ players }: { players: Player[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Fantasy Heroes</CardTitle>
    </CardHeader>
    <CardContent>
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </CardContent>
  </Card>
);

export const PublicEnemies = ({ players }: { players: Player[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Public Enemies</CardTitle>
    </CardHeader>
    <CardContent>
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} />
      ))}
    </CardContent>
  </Card>
);

export const DoubleAgents = ({ players }: { players: Player[] }) => (
  <Card>
    <CardHeader>
      <CardTitle>Double Agents</CardTitle>
    </CardHeader>
    <CardContent>
      {players.map((player) => (
        <PlayerCard key={player.id} player={player} isDoubleAgent={true} />
      ))}
    </CardContent>
  </Card>
);
