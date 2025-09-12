export type Integration = {
  id: string;
  name: string;
  status: 'ok' | 'error';
  lastUpdated: string;
};

export type Alert = {
  id: number;
  message: string;
  timestamp: string;
  type: 'success' | 'error' | 'info';
};

export type Player = {
  id: string;
  name: string;
  position: string;
  realTeam: string;
  score: number;
  gameStatus: string;
  onUserTeams: number;
  onOpponentTeams: number;
  gameDetails: {
    score: string;
    timeRemaining: string;
    fieldPosition: string;
  };
  imageUrl: string;
  on_bench: boolean;
};

export type GroupedPlayer = Player & {
  count: number;
};

export type Team = {
  id: number;
  name: string;
  totalScore: number;
  players: Player[];
  opponent: {
    name: string;
    totalScore: number;
    players: Player[];
  };
};
