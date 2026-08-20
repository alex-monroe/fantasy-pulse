/**
 * Shapes the `Team[]` the app already builds into the payloads the MCP
 * tools return.
 *
 * Everything here is a pure transform: no fetching, no Supabase, no
 * Next.js. The route handler fetches once per request and hands the
 * result to these functions, which keeps the tools cheap to test.
 */
import {
  getGamePercentRemaining,
  getGameStatusLabel,
  processMatchups,
  type Player,
  type Team,
} from '@roster-loom/core';

/** A player as reported over MCP — the display noise (images) stripped. */
export type McpPlayer = {
  name: string;
  position: string;
  nflTeam: string;
  points: number;
  /** Whether the player is in the starting lineup (not on the bench). */
  starting: boolean;
  /** Raw game state: `pregame`, `in_progress` or `final`. */
  gameStatus: string;
  /** Human-readable game state, e.g. `Q3 04:21`, `Sun 1:00 PM`, `Final`. */
  gameStatusLabel: string | null;
  /** Rough share of the game clock left, 0-100, for live games only. */
  percentOfGameRemaining: number | null;
};

/** One side of a head-to-head matchup. */
export type McpSide = {
  teamName: string;
  points: number;
  starters: McpPlayer[];
  bench: McpPlayer[];
};

/** A league, the user's team in it, and the current opponent. */
export type McpLeague = {
  /** Stable handle other tools accept to address this league. */
  leagueKey: string;
  provider: string;
  leagueName: string;
  season: string | null;
  totalRosters: number | null;
  teamName: string;
  points: number;
  opponentName: string;
  opponentPoints: number;
  /** Positive when the user is ahead. */
  margin: number;
  /** Starters whose game has not kicked off yet. */
  startersYetToPlay: number;
  /** Opponent starters whose game has not kicked off yet. */
  opponentStartersYetToPlay: number;
};

/** Where a single NFL player shows up across every league. */
export type McpPlayerExposure = {
  name: string;
  position: string;
  nflTeam: string;
  points: number;
  gameStatus: string;
  gameStatusLabel: string | null;
  /** Leagues where the user rosters the player. */
  rosteredIn: { leagueKey: string; leagueName: string; starting: boolean }[];
  /** Leagues where the user's opponent rosters the player. */
  opposedIn: { leagueKey: string; leagueName: string; starting: boolean }[];
  /** How many of the user's teams roster this player. */
  onYourTeams: number;
  /** How many opposing teams roster this player. */
  onOpponentTeams: number;
  /** True when the player helps in one league and hurts in another. */
  conflicted: boolean;
};

/**
 * Builds the stable handle used to address a league across tool calls.
 *
 * `Team.id` is not dependable — the Sleeper builder sets it from a
 * database column that live-resolved leagues don't carry — so the
 * provider's own league id is preferred, with the team's index as a
 * last resort.
 *
 * @param team - The team to derive a key for.
 * @param index - The team's position in the overall list.
 * @returns A key unique within a single response.
 */
export function leagueKeyFor(team: Team, index: number): string {
  if (team.league?.providerLeagueId) {
    return `${team.league.provider}:${team.league.providerLeagueId}`;
  }

  if (team.league?.provider) {
    return `${team.league.provider}:team-${index + 1}`;
  }

  return `league-${index + 1}`;
}

function toMcpPlayer(player: Player): McpPlayer {
  return {
    name: player.name,
    position: player.position,
    nflTeam: player.realTeam,
    points: player.score,
    starting: !player.onBench,
    gameStatus: player.gameStatus,
    gameStatusLabel: getGameStatusLabel(player),
    percentOfGameRemaining: getGamePercentRemaining(player),
  };
}

function countYetToPlay(players: Player[]): number {
  return players.filter(
    (player) => !player.onBench && player.gameStatus === 'pregame',
  ).length;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Summarises every league the user has a team in.
 *
 * @param teams - The teams built for the request.
 * @returns One entry per league, in the order the providers returned them.
 */
export function summarizeLeagues(teams: Team[]): McpLeague[] {
  return teams.map((team, index) => {
    const points = roundToTenth(team.totalScore);
    const opponentPoints = roundToTenth(team.opponent.totalScore);

    return {
      leagueKey: leagueKeyFor(team, index),
      provider: team.league?.provider ?? 'unknown',
      leagueName: team.league?.name ?? team.name,
      season: team.league?.season ?? null,
      totalRosters: team.league?.totalRosters ?? null,
      teamName: team.name,
      points,
      opponentName: team.opponent.name,
      opponentPoints,
      // Derived from the rounded values so that the three numbers always
      // reconcile in the tool output.
      margin: roundToTenth(points - opponentPoints),
      startersYetToPlay: countYetToPlay(team.players),
      opponentStartersYetToPlay: countYetToPlay(team.opponent.players),
    };
  });
}

/**
 * Finds a team by its league key.
 *
 * @param teams - The teams built for the request.
 * @param leagueKey - The key returned by a previous tool call.
 * @returns The matching team and its key, or `null` when absent.
 */
export function findTeamByLeagueKey(
  teams: Team[],
  leagueKey: string,
): { team: Team; leagueKey: string } | null {
  const normalized = leagueKey.trim().toLowerCase();

  for (let index = 0; index < teams.length; index += 1) {
    const key = leagueKeyFor(teams[index], index);
    if (key.toLowerCase() === normalized) {
      return { team: teams[index], leagueKey: key };
    }
  }

  // Fall back to matching on the league or team name, since a model
  // relaying a name from an earlier response is a likely mistake.
  for (let index = 0; index < teams.length; index += 1) {
    const team = teams[index];
    const candidates = [team.league?.name, team.name, team.league?.providerLeagueId];
    if (
      candidates.some(
        (candidate) => candidate && candidate.trim().toLowerCase() === normalized,
      )
    ) {
      return { team, leagueKey: leagueKeyFor(team, index) };
    }
  }

  return null;
}

function toSide(name: string, points: number, players: Player[]): McpSide {
  const mapped = players.map(toMcpPlayer);

  return {
    teamName: name,
    points: roundToTenth(points),
    starters: mapped.filter((player) => player.starting),
    bench: mapped.filter((player) => !player.starting),
  };
}

/** A full head-to-head matchup for one league. */
export type McpMatchup = McpLeague & {
  you: McpSide;
  opponent: McpSide;
};

/**
 * Expands a single league into both full rosters with per-player scoring.
 *
 * @param team - The team to describe.
 * @param leagueKey - The team's stable league key.
 * @returns The matchup, including bench players on both sides.
 */
export function describeMatchup(team: Team, leagueKey: string): McpMatchup {
  const [summary] = summarizeLeagues([team]);

  return {
    ...summary,
    leagueKey,
    you: toSide(team.name, team.totalScore, team.players),
    opponent: toSide(
      team.opponent.name,
      team.opponent.totalScore,
      team.opponent.players,
    ),
  };
}

/**
 * Aggregates every rostered player across all leagues, recording which
 * leagues they help in and which they hurt in.
 *
 * Players are matched on name plus NFL team, the same rule the app's
 * cross-team badges use.
 *
 * @param teams - The teams built for the request.
 * @returns One entry per distinct player, most-exposed first.
 */
export function aggregatePlayerExposure(teams: Team[]): McpPlayerExposure[] {
  const byPlayer = new Map<string, McpPlayerExposure>();

  const keyOf = (player: Player) =>
    `${player.name.trim().toLowerCase()}|${player.realTeam.trim().toLowerCase()}`;

  const record = (
    player: Player,
    leagueKey: string,
    leagueName: string,
    isOpponent: boolean,
  ) => {
    const key = keyOf(player);
    const existing = byPlayer.get(key);

    const entry: McpPlayerExposure = existing ?? {
      name: player.name,
      position: player.position,
      nflTeam: player.realTeam,
      points: player.score,
      gameStatus: player.gameStatus,
      gameStatusLabel: getGameStatusLabel(player),
      rosteredIn: [],
      opposedIn: [],
      onYourTeams: 0,
      onOpponentTeams: 0,
      conflicted: false,
    };

    const target = isOpponent ? entry.opposedIn : entry.rosteredIn;
    target.push({ leagueKey, leagueName, starting: !player.onBench });

    entry.onYourTeams = entry.rosteredIn.length;
    entry.onOpponentTeams = entry.opposedIn.length;
    entry.conflicted = entry.rosteredIn.length > 0 && entry.opposedIn.length > 0;

    byPlayer.set(key, entry);
  };

  teams.forEach((team, index) => {
    const leagueKey = leagueKeyFor(team, index);
    const leagueName = team.league?.name ?? team.name;

    team.players.forEach((player) => record(player, leagueKey, leagueName, false));
    team.opponent.players.forEach((player) =>
      record(player, leagueKey, leagueName, true),
    );
  });

  return Array.from(byPlayer.values()).sort((a, b) => {
    const exposureDelta =
      b.onYourTeams + b.onOpponentTeams - (a.onYourTeams + a.onOpponentTeams);
    return exposureDelta !== 0 ? exposureDelta : b.points - a.points;
  });
}

/**
 * Filters aggregated exposure down to players matching a search string.
 *
 * @param exposures - The aggregated players to search.
 * @param query - A case-insensitive substring of the player's name or
 *   NFL team.
 * @returns The matching players, in the order given.
 */
export function searchPlayerExposure(
  exposures: McpPlayerExposure[],
  query: string,
): McpPlayerExposure[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  return exposures.filter(
    (exposure) =>
      exposure.name.toLowerCase().includes(normalized) ||
      exposure.nflTeam.toLowerCase().includes(normalized),
  );
}

/** The cross-league rooting guide. */
export type McpRootingGuide = {
  /** Players on more than one of your teams and no opponent's. */
  rootFor: { name: string; position: string; nflTeam: string; points: number; leagues: string[] }[];
  /** Players on more than one opponent team and none of yours. */
  rootAgainst: { name: string; position: string; nflTeam: string; points: number; leagues: string[] }[];
  /** Players on both sides of your slate. */
  conflicted: {
    name: string;
    position: string;
    nflTeam: string;
    points: number;
    yourLeagues: string[];
    opponentLeagues: string[];
  }[];
};

/**
 * Classifies players into who you want to do well, who you don't, and
 * who you are conflicted about. Wraps the app's existing matchup report.
 *
 * @param teams - The teams built for the request.
 * @returns The three buckets.
 */
export function buildRootingGuide(teams: Team[]): McpRootingGuide {
  const { fantasyHeroes, publicEnemies, doubleAgents } = processMatchups(teams);

  return {
    rootFor: fantasyHeroes.map((player) => ({
      name: player.name,
      position: player.position,
      nflTeam: player.realTeam,
      points: player.score,
      leagues: player.matchups,
    })),
    rootAgainst: publicEnemies.map((player) => ({
      name: player.name,
      position: player.position,
      nflTeam: player.realTeam,
      points: player.score,
      leagues: player.matchups,
    })),
    conflicted: doubleAgents.map((player) => ({
      name: player.name,
      position: player.position,
      nflTeam: player.realTeam,
      points: player.score,
      yourLeagues: player.userMatchups,
      opponentLeagues: player.opponentMatchups,
    })),
  };
}
