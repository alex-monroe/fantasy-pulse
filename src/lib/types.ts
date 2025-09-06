export interface Player {
  id: number;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF';
  realTeam: string;
  score: number;
  gameStatus: 'possession' | 'sidelines' | 'final' | 'pregame';
  onUserTeams: number;
  onOpponentTeams: number;
  gameDetails: {
    score: string;
    timeRemaining: string;
    fieldPosition: string;
  };
  imageUrl: string;
}

export interface Team {
  id: number;
  name: string;
  players: Player[];
  opponent: {
    name: string;
    players: Player[];
    totalScore: number;
  };
  totalScore: number;
}

export interface Integration {
    id: string;
    name: string;
    status: 'ok' | 'error';
    lastUpdated: string;
}

export interface Alert {
    id: number;
    message: string;
    timestamp: string;
    type: 'success' | 'error' | 'info';
}
