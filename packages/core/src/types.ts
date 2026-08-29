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
  /** The scheduled kickoff time for the player's game, if known. */
  gameStartTime: string | null;
  /** The current quarter for games in progress. */
  gameQuarter: string | null;
  /** The current game clock for games in progress. */
  gameClock: string | null;
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
  onBench: boolean;
  /**
   * This week's projected fantasy points, scored against the player's own
   * league's scoring settings. Absent when no projection or scoring
   * settings were available to compute it.
   */
  projectedPoints?: number;
};

/**
 * Represents a player grouped across multiple teams.
 */
export type PlayerMatchupColor = {
  /** The color associated with the matchup. */
  color: string;
  /** Indicates whether the player is on the bench for this matchup. */
  onBench: boolean;
};

export type GroupedPlayer = Player & {
  /** The number of teams the player belongs to. */
  count: number;
  /** The colors of the matchups this player is in. */
  matchupColors: PlayerMatchupColor[];
};

/** The fantasy platforms a league can come from. */
export type FantasyProvider = 'sleeper' | 'yahoo' | 'ottoneu' | 'espn' | 'demo';

/**
 * Identifies the league a team plays in. Attached to {@link Team} so
 * consumers that aggregate across providers (the MCP server, reports)
 * can tell two teams apart by more than a display name.
 */
export type LeagueRef = {
  /** The platform hosting the league. */
  provider: FantasyProvider;
  /** The league's identifier in the provider's own namespace. */
  providerLeagueId: string;
  /** The league's display name. */
  name: string;
  /** The season the league is being played in, when known. */
  season?: string | null;
  /** How many teams the league has, when known. */
  totalRosters?: number | null;
};

/**
 * Represents a fantasy football team.
 */
export type Team = {
  /** The unique identifier for the team. */
  id: number;
  /** The name of the team. */
  name: string;
  /** The league this team plays in, when the provider supplied it. */
  league?: LeagueRef;
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
  /**
   * Flat map of Sleeper stat key -> point value (e.g. `{ pass_yd: 0.04,
   * rec: 0.5, fgm_40_49: 4 }`). Only present when fetched from the
   * single-league endpoint; the leagues-list endpoint does not include it.
   */
  scoring_settings?: Record<string, number>;
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

/**
 * Represents the `/v1/state/nfl` response. `week` is scoped to
 * `season_type` — during the preseason it counts preseason weeks, not
 * regular-season weeks, so callers must gate on `season_type` before
 * trusting `week` for regular-season data.
 */
export interface SleeperNflState {
  week: number;
  season_type: 'pre' | 'regular' | 'post' | string;
  season: string;
  display_week?: number;
  season_start_date?: string;
}

/**
 * The stat line inside a Sleeper projection or stats row. Sleeper does
 * not document this shape; treat unfamiliar keys as fine (they are simply
 * unused) but validate that at least some expected key is present before
 * trusting a whole payload — see the ingest's own validation.
 */
export type SleeperStatLine = Record<string, number>;

/**
 * One row of `/projections/nfl/{season}/{week}` or
 * `/stats/nfl/{season}/{week}`. Undocumented but publicly reachable —
 * projections are licensed from Rotowire (`company: "rotowire"`).
 */
export interface SleeperProjection {
  player_id: string;
  team?: string;
  opponent?: string;
  week: number;
  /** String, not a number, on the wire. */
  season: string;
  date?: string;
  game_id?: string;
  company?: string;
  category?: string;
  last_modified?: number;
  stats?: SleeperStatLine;
  player?: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    injury_status?: string | null;
    injury_body_part?: string | null;
    years_exp?: number;
  };
}
