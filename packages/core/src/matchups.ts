import { getGamePhase } from './player-status';
import type { GroupedPlayer, Player, Team } from './types';

/**
 * The palette used to color-code matchups across the aggregated views.
 * Shared so the web dashboard and the mobile app assign identical colors.
 */
export const MATCHUP_COLORS = ['#f87171', '#60a5fa', '#facc15', '#4ade80', '#a78bfa', '#f472b6'];

/** The fantasy positions we bucket players into, in display order. */
export const PLAYER_POSITIONS = ['QB', 'WR', 'RB', 'TE', 'Other'] as const;

/**
 * Builds the key used to aggregate the same NFL player across multiple
 * fantasy teams. Players are considered the same when their name and
 * real-life team match (case-insensitive, trimmed).
 *
 * @param player - The player to derive a key for.
 * @returns The aggregation key, or `null` when the player lacks the data
 *   needed to be aggregated reliably.
 */
export const createPlayerAggregationKey = (player: Player | GroupedPlayer): string | null => {
  if (!player) {
    return null;
  }

  const name = typeof player.name === 'string' ? player.name.trim().toLowerCase() : '';
  const realTeam = typeof player.realTeam === 'string' ? player.realTeam.trim().toLowerCase() : '';

  if (!name || !realTeam) {
    return null;
  }

  return `${name}-${realTeam}`;
};

/**
 * Assigns a stable color to each team based on its position in the list.
 *
 * @param teams - The teams to color.
 * @param colors - The palette to cycle through.
 * @returns A map from team id to hex color.
 */
export const assignTeamColors = (
  teams: Team[],
  colors: string[] = MATCHUP_COLORS,
): Map<number, string> => {
  const colorMap = new Map<number, string>();
  teams.forEach((team, index) => {
    colorMap.set(team.id, colors[index % colors.length]);
  });
  return colorMap;
};

const addMatchupColor = (
  matchupColors: GroupedPlayer['matchupColors'],
  color: string,
  onBench: boolean,
) => {
  const existingMatchup = matchupColors.find((matchup) => matchup.color === color);
  if (existingMatchup) {
    existingMatchup.onBench = existingMatchup.onBench && onBench;
  } else {
    matchupColors.push({ color, onBench });
  }
};

const groupPlayers = (
  players: Player[],
  existingPlayers: Map<string, GroupedPlayer>,
  priorityMap: Map<string, number>,
  color: string,
  teamPriority: number,
) => {
  players.forEach((player) => {
    const key = createPlayerAggregationKey(player);
    if (!key) {
      return;
    }

    const existingPlayer = existingPlayers.get(key);
    const currentMatchupColors = existingPlayer ? [...existingPlayer.matchupColors] : [];
    addMatchupColor(currentMatchupColors, color, player.onBench);

    const newCount = (existingPlayer?.count ?? 0) + 1;
    const existingPriority = priorityMap.get(key);
    const shouldUsePlayerData = existingPriority === undefined || teamPriority < existingPriority;
    const candidate = shouldUsePlayerData ? player : existingPlayer!;

    const mergedPlayer: GroupedPlayer = {
      ...candidate,
      count: newCount,
      matchupColors: currentMatchupColors,
    };

    existingPlayers.set(key, mergedPlayer);
    const nextPriority = shouldUsePlayerData ? teamPriority : existingPriority ?? teamPriority;
    priorityMap.set(key, nextPriority);
  });
};

/** The aggregated rosters for the "Matchup Overview" view. */
export interface GroupedRosters {
  /** Players across all of the user's teams, deduplicated. */
  myPlayers: GroupedPlayer[];
  /** Players across all opponent teams, deduplicated. */
  opponentPlayers: GroupedPlayer[];
}

/**
 * Aggregates every team's roster into a single "my players" and
 * "opponent players" view, deduplicating players that appear on more than
 * one team and recording a color dot per matchup they appear in.
 *
 * When the same player appears on multiple teams, the display data
 * (position, score, etc.) is taken from the highest-priority team.
 *
 * @param teams - The user's teams with their opponents.
 * @param options.priorityOrder - Team ids in priority order (index 0 =
 *   highest priority). Defaults to the order `teams` is given in.
 * @param options.colors - The palette to color-code matchups with.
 * @returns The deduplicated, color-coded rosters.
 */
export const groupMatchupPlayers = (
  teams: Team[],
  options: { priorityOrder?: number[]; colors?: string[] } = {},
): GroupedRosters => {
  const { priorityOrder, colors = MATCHUP_COLORS } = options;
  const teamColors = assignTeamColors(teams, colors);

  const priorityLookup = new Map<number, number>();
  const order = priorityOrder ?? teams.map((team) => team.id);
  order.forEach((teamId, index) => {
    if (!priorityLookup.has(teamId)) {
      priorityLookup.set(teamId, index);
    }
  });

  const myPlayersMap = new Map<string, GroupedPlayer>();
  const opponentPlayersMap = new Map<string, GroupedPlayer>();
  const myPlayerPriorityMap = new Map<string, number>();
  const opponentPlayerPriorityMap = new Map<string, number>();

  teams.forEach((team) => {
    const color = teamColors.get(team.id) ?? colors[0];
    const teamPriority = priorityLookup.get(team.id) ?? Number.MAX_SAFE_INTEGER;

    groupPlayers(team.players, myPlayersMap, myPlayerPriorityMap, color, teamPriority);
    groupPlayers(
      team.opponent.players,
      opponentPlayersMap,
      opponentPlayerPriorityMap,
      color,
      teamPriority,
    );
  });

  return {
    myPlayers: Array.from(myPlayersMap.values()),
    opponentPlayers: Array.from(opponentPlayersMap.values()),
  };
};

/**
 * Buckets players by fantasy position (QB/WR/RB/TE, everything else under
 * "Other"). Unknown or missing positions are ignored.
 *
 * @param players - The players to bucket.
 * @returns A record keyed by position, each value a list of players.
 */
export const groupPlayersByPosition = <T extends Player>(players: T[]): Record<string, T[]> => {
  const positions = ['QB', 'WR', 'RB', 'TE'];
  const grouped: Record<string, T[]> = {
    QB: [],
    WR: [],
    RB: [],
    TE: [],
    Other: [],
  };

  players.forEach((player) => {
    if (player && typeof player.position === 'string') {
      const position = player.position.toUpperCase();
      if (positions.includes(position)) {
        grouped[position].push(player);
      } else {
        grouped.Other.push(player);
      }
    }
  });

  return grouped;
};

/** A player featured in the matchup report, with the teams they appear on. */
export type MatchupReportPlayer = Player & { matchups: string[] };

/** A player appearing on both a user's team and an opponent's team. */
export type DoubleAgentPlayer = Player & {
  userMatchups: string[];
  opponentMatchups: string[];
};

/** The result of {@link processMatchups}. */
export interface MatchupReport {
  /** Players on more than one of the user's teams (and no opponent's). */
  fantasyHeroes: MatchupReportPlayer[];
  /** Players on more than one opponent team (and none of the user's). */
  publicEnemies: MatchupReportPlayer[];
  /** Players on both a user's team and an opponent's team. */
  doubleAgents: DoubleAgentPlayer[];
}

/**
 * Classifies every player across all matchups into "fantasy heroes"
 * (rooting for), "public enemies" (rooting against), and "double agents"
 * (conflicted — on both sides).
 *
 * @param matchups - The user's teams with their opponents.
 * @returns The three classified player buckets.
 */
export const processMatchups = (matchups: Team[]): MatchupReport => {
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
        playerMap[player.name].opponentMatchups.push(matchup.opponent.name);
      } else {
        if (matchup.name === undefined) return;
        playerMap[player.name].userMatchups.push(matchup.name);
      }
    };

    matchup.players.forEach((p) => processPlayer(p, false));
    matchup.opponent.players.forEach((p) => processPlayer(p, true));
  });

  const fantasyHeroes: MatchupReportPlayer[] = [];
  const publicEnemies: MatchupReportPlayer[] = [];
  const doubleAgents: DoubleAgentPlayer[] = [];

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

/** How many of a roster's starters are in each game phase. */
export interface RosterGameCounts {
  /** Starters whose game is being played right now. */
  live: number;
  /** Starters whose game has not kicked off yet. */
  yetToPlay: number;
  /** Starters whose game is over. */
  done: number;
}

/** A single league matchup reduced to the numbers the scoreboard shows. */
export interface MatchupSummary {
  /** The team the summary describes. */
  team: Team;
  /** The user's score. */
  score: number;
  /** The opponent's score. */
  opponentScore: number;
  /** User score minus opponent score. Negative when trailing. */
  differential: number;
  /** Whether the user is ahead. */
  isLeading: boolean;
  /** Whether both sides are level (to a tenth of a point). */
  isTied: boolean;
  /** The user's share of the combined score, in [0, 1]. `0.5` when both are zero. */
  scoreShare: number;
  /** Game-phase counts across the user's starters. */
  counts: RosterGameCounts;
  /** Game-phase counts across the opponent's starters. */
  opponentCounts: RosterGameCounts;
}

const countStarterGamePhases = (players: Player[]): RosterGameCounts => {
  const counts: RosterGameCounts = { live: 0, yetToPlay: 0, done: 0 };

  players.forEach((player) => {
    if (!player || player.onBench) {
      return;
    }

    const phase = getGamePhase(player);
    if (phase === 'live') {
      counts.live += 1;
    } else if (phase === 'pregame') {
      counts.yetToPlay += 1;
    } else if (phase === 'final') {
      counts.done += 1;
    }
  });

  return counts;
};

/**
 * Reduces one league matchup to the handful of numbers the scoreboard
 * renders: both scores, who is ahead and by how much, the split used for
 * the tug-of-war bar, and how much football each side has left.
 *
 * @param team - The user's team, with its opponent attached.
 * @returns The summary for that matchup.
 */
export const summarizeMatchup = (team: Team): MatchupSummary => {
  const score = team.totalScore ?? 0;
  const opponentScore = team.opponent?.totalScore ?? 0;
  const differential = score - opponentScore;
  const combined = score + opponentScore;

  return {
    team,
    score,
    opponentScore,
    differential,
    isLeading: differential > 0,
    isTied: Math.abs(differential) < 0.05,
    scoreShare: combined > 0 ? score / combined : 0.5,
    counts: countStarterGamePhases(team.players ?? []),
    opponentCounts: countStarterGamePhases(team.opponent?.players ?? []),
  };
};

/** Aggregate standing across every league the user is playing this week. */
export interface WeekOverview {
  /** Matchups the user is currently winning. */
  leading: number;
  /** Matchups the user is currently losing. */
  trailing: number;
  /** Matchups that are level. */
  tied: number;
  /** Total matchups. */
  total: number;
  /** Distinct starters of the user's whose game is live right now. */
  playersLive: number;
  /** Distinct starters of the user's who have not kicked off yet. */
  playersYetToPlay: number;
}

/**
 * Rolls every matchup up into the one-line "how is my Sunday going"
 * summary shown above the board. Players are deduplicated across leagues
 * so someone rostered in six leagues counts once.
 *
 * @param teams - The user's teams with their opponents.
 * @returns The week-wide overview.
 */
export const summarizeWeek = (teams: Team[]): WeekOverview => {
  const overview: WeekOverview = {
    leading: 0,
    trailing: 0,
    tied: 0,
    total: teams.length,
    playersLive: 0,
    playersYetToPlay: 0,
  };

  const livePlayers = new Set<string>();
  const pendingPlayers = new Set<string>();

  teams.forEach((team) => {
    const { isLeading, isTied } = summarizeMatchup(team);
    if (isTied) {
      overview.tied += 1;
    } else if (isLeading) {
      overview.leading += 1;
    } else {
      overview.trailing += 1;
    }

    (team.players ?? []).forEach((player) => {
      if (!player || player.onBench) {
        return;
      }
      const key = createPlayerAggregationKey(player);
      if (!key) {
        return;
      }
      const phase = getGamePhase(player);
      if (phase === 'live') {
        livePlayers.add(key);
      } else if (phase === 'pregame') {
        pendingPlayers.add(key);
      }
    });
  });

  overview.playersLive = livePlayers.size;
  overview.playersYetToPlay = pendingPlayers.size;

  return overview;
};
