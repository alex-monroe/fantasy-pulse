import { projectMatchup, type MatchupProjection } from './matchup-projection';
import { getGamePhase } from './player-status';
import type { GroupedPlayer, Player, Team } from './types';

/**
 * The palette used to color-code matchups across the aggregated views.
 * Shared so the web dashboard and the mobile app assign identical colors.
 *
 * Ordered so neighbouring leagues land on well-separated hues. Users with
 * more leagues than there are entries here fall through to
 * {@link getMatchupColor}, which keeps generating distinct colors rather
 * than wrapping the palette around.
 */
export const MATCHUP_COLORS = [
  '#f87171', // red
  '#60a5fa', // blue
  '#facc15', // yellow
  '#4ade80', // green
  '#a78bfa', // violet
  '#f472b6', // pink
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#a3e635', // lime
  '#818cf8', // indigo
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
];

/** Where the generated hues start when the palette offers none to space them against. */
const GENERATED_HUE_OFFSET = 25;

/** Saturation of the generated hues, matching the palette's weight. */
const GENERATED_SATURATION = 80;

/**
 * Generated colors alternate between a light and a deep lightness. Hue
 * alone stops carrying a dot once there are enough of them, so every
 * other one is darkened to keep neighbours telling themselves apart.
 */
const GENERATED_LIGHTNESS = [66, 48];

/**
 * Converts an HSL triple to a hex string, so generated colors are the
 * same shape as the hand-picked palette (the DOM and React Native both
 * take hex without any further handling).
 *
 * @param hue - Hue in degrees.
 * @param saturation - Saturation as a percentage.
 * @param lightness - Lightness as a percentage.
 * @returns The color as `#rrggbb`.
 */
const hslToHex = (hue: number, saturation: number, lightness: number): string => {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const huePrime = (((hue % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [r, g, b] =
    huePrime < 1
      ? [chroma, x, 0]
      : huePrime < 2
        ? [x, chroma, 0]
        : huePrime < 3
          ? [0, chroma, x]
          : huePrime < 4
            ? [0, x, chroma]
            : huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];

  const m = l - chroma / 2;
  const toChannel = (value: number) =>
    Math.round((value + m) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
};

/**
 * The hue of a `#rgb` / `#rrggbb` color, in degrees.
 *
 * @param hex - The color to read.
 * @returns The hue, or `null` for a grey or unparseable color (neither
 *   has a hue worth spacing the generated colors against).
 */
const hueOfHex = (hex: string): number | null => {
  const raw = typeof hex === 'string' ? hex.trim().replace('#', '') : '';
  const full = raw.length === 3 ? raw.replace(/./g, (char) => char + char) : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }

  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) {
    return null;
  }

  const hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (((hue * 60) % 360) + 360) % 360;
};

/**
 * Picks the hue furthest from every hue already in use, by bisecting the
 * widest gap on the color wheel. Repeating this keeps each new league's
 * dot as far as possible from the ones already on screen.
 *
 * @param hues - The hues already taken, in any order.
 * @returns The next hue, in degrees.
 */
const bisectWidestHueGap = (hues: number[]): number => {
  if (hues.length === 0) {
    return GENERATED_HUE_OFFSET;
  }

  const sorted = [...hues].sort((a, b) => a - b);
  let widest = -1;
  let hue = sorted[0];

  sorted.forEach((current, index) => {
    const next = index + 1 < sorted.length ? sorted[index + 1] : sorted[0] + 360;
    const gap = next - current;
    if (gap > widest) {
      widest = gap;
      hue = (current + gap / 2) % 360;
    }
  });

  return hue;
};

/**
 * The color for the nth matchup. The first entries come from the
 * hand-picked palette; past the end of it, colors are generated on hues
 * that sit in the widest gaps left by the ones already used, so every
 * league keeps its own dot instead of two leagues sharing one once the
 * palette runs out.
 *
 * @param index - The matchup's position in the display order.
 * @param colors - The palette to draw the first colors from.
 * @returns A hex color, distinct from every other index's.
 */
export const getMatchupColor = (index: number, colors: string[] = MATCHUP_COLORS): string => {
  const position = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  if (position < colors.length) {
    return colors[position];
  }

  const hues = colors.map(hueOfHex).filter((hue): hue is number => hue !== null);

  const generated = position - colors.length;
  let hue = bisectWidestHueGap(hues);
  for (let step = 0; step < generated; step += 1) {
    hues.push(hue);
    hue = bisectWidestHueGap(hues);
  }

  return hslToHex(
    hue,
    GENERATED_SATURATION,
    GENERATED_LIGHTNESS[generated % GENERATED_LIGHTNESS.length],
  );
};

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
 * The identity a team is tracked by across the aggregated views: colors,
 * matchup priority, and React keys.
 *
 * `Team.id` cannot carry this. Each provider fills it from a different
 * namespace — Sleeper from a database column that live-resolved leagues
 * don't carry at all (so it is `undefined` for every Sleeper team),
 * Yahoo and ESPN from their team rows, Ottoneu from the id on the team
 * page — so ids both collide and go missing. The provider's own league
 * id is unique per league and always present on a real matchup, so it
 * leads here, with the team id and finally the team's position as
 * fallbacks for the fixtures that carry no league.
 *
 * @param team - The team to identify.
 * @param index - The team's position in the list, used as a last resort.
 * @returns A key unique to that team within the user's set of teams.
 */
export const getTeamKey = (team: Team, index: number): string => {
  const league = team?.league;
  if (league?.providerLeagueId) {
    return `${league.provider}:${league.providerLeagueId}`;
  }

  if (Number.isFinite(team?.id)) {
    return `team-${team.id}`;
  }

  return `team-index-${index}`;
};

/**
 * Assigns a stable color to each team based on its position in the list.
 * Every team gets its own color — the palette is extended with generated
 * hues rather than reused — so two leagues never share a dot, whichever
 * providers they come from.
 *
 * @param teams - The teams to color.
 * @param colors - The palette to draw the first colors from.
 * @returns A map from {@link getTeamKey} to hex color.
 */
export const assignTeamColors = (
  teams: Team[],
  colors: string[] = MATCHUP_COLORS,
): Map<string, string> => {
  const colorMap = new Map<string, string>();
  teams.forEach((team, index) => {
    colorMap.set(getTeamKey(team, index), getMatchupColor(index, colors));
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
 * @param options.priorityOrder - {@link getTeamKey} values in priority
 *   order (index 0 = highest priority). Defaults to the order `teams` is
 *   given in.
 * @param options.colors - The palette to color-code matchups with.
 * @returns The deduplicated, color-coded rosters.
 */
export const groupMatchupPlayers = (
  teams: Team[],
  options: { priorityOrder?: string[]; colors?: string[] } = {},
): GroupedRosters => {
  const { priorityOrder, colors = MATCHUP_COLORS } = options;
  const teamColors = assignTeamColors(teams, colors);
  const teamKeys = teams.map((team, index) => getTeamKey(team, index));

  const priorityLookup = new Map<string, number>();
  const order = priorityOrder ?? teamKeys;
  order.forEach((teamKey, index) => {
    if (!priorityLookup.has(teamKey)) {
      priorityLookup.set(teamKey, index);
    }
  });

  const myPlayersMap = new Map<string, GroupedPlayer>();
  const opponentPlayersMap = new Map<string, GroupedPlayer>();
  const myPlayerPriorityMap = new Map<string, number>();
  const opponentPlayerPriorityMap = new Map<string, number>();

  teams.forEach((team, index) => {
    const teamKey = teamKeys[index];
    const color = teamColors.get(teamKey) ?? getMatchupColor(index, colors);
    const teamPriority = priorityLookup.get(teamKey) ?? Number.MAX_SAFE_INTEGER;

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
  /**
   * Both rosters projected forward to a final score, and the win
   * probability that follows from the gap between them.
   */
  projection: MatchupProjection;
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
 * the tug-of-war bar, how much football each side has left, and where
 * both rosters are projected to finish.
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
    projection: projectMatchup(team),
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
  /** Matchups projected to finish as wins. */
  projectedLeading: number;
  /** Matchups projected to finish as losses. */
  projectedTrailing: number;
  /** Matchups projected to finish level. */
  projectedTied: number;
  /**
   * Wins expected across the week: the win probabilities added up. Sits
   * between the record the user has right now and the record they're
   * projected for, and reads as a fraction on purpose — three coin
   * flips are 1.5 wins, not 3 and not 0.
   */
  expectedWins: number;
  /** Matchups that carried enough projection data to contribute above. */
  projectedMatchups: number;
}

/**
 * Rolls every matchup up into the one-line "how is my Sunday going"
 * summary shown above the board: the record right now, the record the
 * projections point at, and how many wins those projections expect.
 * Players are deduplicated across leagues so someone rostered in six
 * leagues counts once.
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
    projectedLeading: 0,
    projectedTrailing: 0,
    projectedTied: 0,
    expectedWins: 0,
    projectedMatchups: 0,
  };

  const livePlayers = new Set<string>();
  const pendingPlayers = new Set<string>();

  teams.forEach((team) => {
    const { isLeading, isTied, projection } = summarizeMatchup(team);
    if (isTied) {
      overview.tied += 1;
    } else if (isLeading) {
      overview.leading += 1;
    } else {
      overview.trailing += 1;
    }

    if (projection.hasProjections) {
      overview.projectedMatchups += 1;
      overview.expectedWins += projection.winProbability;

      if (Math.abs(projection.differential) < 0.05) {
        overview.projectedTied += 1;
      } else if (projection.differential > 0) {
        overview.projectedLeading += 1;
      } else {
        overview.projectedTrailing += 1;
      }
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
