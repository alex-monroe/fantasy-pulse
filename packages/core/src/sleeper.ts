import {
  Player,
  SleeperMatchup,
  SleeperPlayer,
  SleeperProjection,
  SleeperRoster,
  SleeperStatLine,
} from './types';

/**
 * Scores a Sleeper stat line against a league's own scoring settings,
 * rather than trusting Sleeper's precomputed `pts_*` fields (which are
 * Sleeper's own PPR/half-PPR/standard rules and silently diverge from any
 * custom scoring — kicker distance bands are the usual culprit).
 *
 * Sums `stat[key] * weight` over every key both objects share. Returns
 * `null` when there is no stat line to score (e.g. no projection for this
 * player), and `0` when there is a stat line but none of its keys carry
 * weight in this league's settings.
 */
export function scoreStatLine(
  stats: SleeperStatLine | undefined,
  scoringSettings: Record<string, number> | undefined
): number | null {
  if (!stats || !scoringSettings) {
    return null;
  }

  let total = 0;
  for (const [key, weight] of Object.entries(scoringSettings)) {
    const value = stats[key];
    if (typeof weight === 'number' && typeof value === 'number') {
      total += value * weight;
    }
  }
  return total;
}

export type MapSleeperPlayerParams = {
  playerId: string;
  playersData: Record<string, SleeperPlayer>;
  matchup: SleeperMatchup;
  roster: SleeperRoster | null;
  /** This week's Sleeper projection for the player, if one exists. */
  projection?: SleeperProjection;
  /** The player's league's scoring settings, used to score `projection`. */
  scoringSettings?: Record<string, number>;
};

/**
 * Maps a Sleeper player ID to the internal Player representation.
 * Returns null when player data cannot be found.
 */
export function mapSleeperPlayer({
  playerId,
  playersData,
  matchup,
  roster,
  projection,
  scoringSettings,
}: MapSleeperPlayerParams): Player | null {
  const player = playersData[playerId];
  if (!player) {
    return null;
  }

  const starters = roster?.starters ?? [];
  const computedName =
    player.full_name ||
    [player.first_name, player.last_name].filter(Boolean).join(' ');
  const name = computedName?.trim() ? computedName.trim() : 'Unknown Player';
  const projectedPoints = scoreStatLine(projection?.stats, scoringSettings);

  return {
    id: playerId,
    name,
    position: player.position ?? '',
    realTeam: player.team ?? '',
    score: matchup.players_points?.[playerId] ?? 0,
    gameStatus: 'pregame',
    gameStartTime: null,
    gameQuarter: null,
    gameClock: null,
    onUserTeams: 0,
    onOpponentTeams: 0,
    gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
    imageUrl: `https://sleepercdn.com/content/nfl/players/thumb/${playerId}.jpg`,
    onBench: !starters.includes(playerId),
    ...(projectedPoints !== null ? { projectedPoints } : {}),
  };
}
