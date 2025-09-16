type Player = {
  id: string | number;
  name: string;
  onUserTeams: number;
  onOpponentTeams: number;
};

type Matchup = {
  id: number;
  name: string;
  players: Player[];
  opponent: {
    name: string;
    players: Player[];
  };
};

export const processMatchups = (matchups: Matchup[]) => {
  const playerMap: Record<
    string,
    {
      player: Player;
      userMatchups: string[];
      opponentMatchups: string[];
    }
  > = {};

  matchups.forEach((matchup) => {
    const processPlayer = (player: Player, isOpponent: boolean) => {
      if (!playerMap[player.name]) {
        playerMap[player.name] = {
          player,
          userMatchups: [],
          opponentMatchups: [],
        };
      }
      if (isOpponent) {
        playerMap[player.name].opponentMatchups.push(matchup.name);
      } else {
        playerMap[player.name].userMatchups.push(matchup.name);
      }
    };

    matchup.players.forEach((p) => processPlayer(p, false));
    matchup.opponent.players.forEach((p) => processPlayer(p, true));
  });

  const fantasyHeroes: any[] = [];
  const publicEnemies: any[] = [];
  const doubleAgents: any[] = [];

  Object.values(playerMap).forEach(({ player, userMatchups, opponentMatchups }) => {
    if (userMatchups.length > 1 && opponentMatchups.length === 0) {
      fantasyHeroes.push({ ...player, matchups: userMatchups });
    } else if (opponentMatchups.length > 1 && userMatchups.length === 0) {
      publicEnemies.push({ ...player, matchups: opponentMatchups });
    } else if (userMatchups.length > 0 && opponentMatchups.length > 0) {
      doubleAgents.push({
        ...player,
        userMatchups,
        opponentMatchups,
      });
    }
  });

  return { fantasyHeroes, publicEnemies, doubleAgents };
};
