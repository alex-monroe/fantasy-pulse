/**
 * Represents a third-party integration.
 */
export type Integration = {
  /** The unique identifier for the integration. */
  id: string;
  /** The name of the integration (e.g., 'Sleeper', 'Yahoo'). */
  name: string;
  /** The status of the integration. */
  status: 'ok' | 'error';
  /** The timestamp of the last update. */
  lastUpdated: string;
};

/**
 * Represents an alert message.
 */
export type Alert = {
  /** The unique identifier for the alert. */
  id: number;
  /** The content of the alert message. */
  message: string;
  /** The timestamp when the alert was created. */
  timestamp: string;
  /** The type of the alert. */
  type: 'success' | 'error' | 'info';
};

/**
 * Represents a fantasy football player.
 */
export type Player = {
  /** The unique identifier for the player. */
  id:string;
  /** The name of the player. */
  name: string;
  /** The player's position (e.g., 'QB', 'WR'). */
  position: string;
  /** The player's real-life NFL team. */
  realTeam: string;
  /** The player's fantasy score. */
  score: number;
  /** The status of the player's game. */
  gameStatus: string;
  /** The number of user's teams the player is on. */
  onUserTeams: number;
  /** The number of opponent's teams the player is on. */
  onOpponentTeams: number;
  /** Details about the player's current game. */
  gameDetails: {
    /** The score of the game. */
    score: string;
    /** The time remaining in the game. */
    timeRemaining: string;
    /** The current field position. */
    fieldPosition: string;
  };
  /** The URL of the player's image. */
  imageUrl: string;
  /** Whether the player is on the bench. */
  on_bench: boolean;
};

/**
 * Represents a user integration with a third-party provider.
 */
export interface UserIntegration {
  /** The unique identifier for the user integration. */
  id: number;
  /** The user's unique identifier. */
  user_id: string;
  /** The name of the provider (e.g., 'sleeper', 'yahoo'). */
  provider: string;
  /** The user's identifier on the provider's platform. */
  provider_user_id: string;
  /** The access token for the provider's API. */
  access_token?: string;
  /** The refresh token for the provider's API. */
  refresh_token?: string;
  /** The expiration date of the access token. */
  expires_at?: string;
  /** The timestamp when the user integration was created. */
  created_at: string;
}

/**
 * Represents a fantasy football league.
 */
export interface League {
  /** The unique identifier for the league. */
  id: number;
  /** The league's identifier on the provider's platform. */
  league_id: string;
  /** The name of the league. */
  name: string;
  /** The unique identifier for the user integration. */
  user_integration_id: number;
  /** The season of the league. */
  season: string;
  /** The total number of rosters in the league. */
  total_rosters: number;
  /** The status of the league. */
  status: string;
  /** The user's unique identifier. */
  user_id: string;
  /** The timestamp when the league was created. */
  created_at: string;
}

/**
 * Represents a player grouped across multiple teams.
 */
export type GroupedPlayer = Player & {
  /** The number of teams the player belongs to. */
  count: number;
};

/**
 * Represents a fantasy football team.
 */
export type Team = {
  /** The unique identifier for the team. */
  id: number;
  /** The name of the team. */
  name: string;
  /** The total score of the team. */
  totalScore: number;
  /** The list of players on the team. */
  players: Player[];
  /** The opponent's team. */
  opponent: {
    /** The name of the opponent's team. */
    name: string;
    /** The total score of the opponent's team. */
    totalScore: number;
    /** The list of players on the opponent's team. */
    players: Player[];
  };
};
