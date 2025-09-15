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
 * Represents a player grouped across multiple teams.
 */
export type GroupedPlayer = Player & {
  /** The number of teams the player belongs to. */
  count: number;
  /** The colors of the matchups this player is in. */
  matchupColors: string[];
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

/**
 * Represents a Sleeper league.
 */
export interface SleeperLeague {
  /** Internal database identifier. */
  id?: number;
  /** Sleeper league identifier. */
  league_id: string;
  /** Display name of the league. */
  name?: string;
  /** Season year of the league. */
  season?: string;
  /** Number of rosters in the league. */
  total_rosters?: number;
  /** Current status of the league. */
  status?: string;
}

/**
 * Represents a Sleeper roster.
 */
export interface SleeperRoster {
  /** Unique roster identifier. */
  roster_id: number;
  /** User identifier for the roster owner. */
  owner_id: string;
  /** Player IDs on the roster. */
  players: string[];
  /** Starter player IDs. */
  starters: string[];
}

/**
 * Represents a Sleeper matchup.
 */
export interface SleeperMatchup {
  /** Roster participating in the matchup. */
  roster_id: number;
  /** Matchup grouping identifier. */
  matchup_id: number;
  /** Fantasy points scored by the roster. */
  points: number;
  /** Player IDs involved in the matchup. */
  players: string[];
  /** Points scored by each player. */
  players_points?: Record<string, number>;
}

/**
 * Represents a Sleeper user within a league.
 */
export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar?: string;
  metadata?: {
    team_name?: string;
  };
}

/**
 * Represents details for an NFL player from Sleeper.
 */
export interface SleeperPlayer {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
}

/**
 * Represents a player within a Sleeper matchup.
 */
export interface SleeperMatchupPlayer {
  player_id: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string;
  score: number;
}

/**
 * Represents a Sleeper matchup enriched with user and player information.
 */
export interface SleeperEnrichedMatchup extends SleeperMatchup {
  user: {
    display_name: string;
    avatar?: string;
  };
  players: SleeperMatchupPlayer[];
  total_points: number;
}
