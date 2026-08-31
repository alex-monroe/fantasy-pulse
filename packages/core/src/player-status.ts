import type { GroupedPlayer, Player } from './types';

type PlayerLike = Pick<
  Player | GroupedPlayer,
  'gameStatus' | 'gameStartTime' | 'gameQuarter' | 'gameClock'
>;

function formatKickoffTime(gameStartTime: string | null): string | null {
  if (!gameStartTime) {
    return null;
  }

  const kickoffDate = new Date(gameStartTime);
  if (Number.isNaN(kickoffDate.getTime())) {
    return null;
  }

  try {
    const day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(kickoffDate);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(kickoffDate);
    return `${day} ${time}`;
  } catch {
    return null;
  }
}

/**
 * Produces a short human label describing a player's game state:
 * kickoff time before the game, quarter + clock while live, "Final"
 * (or the recorded detail) once over.
 *
 * @param player - The player whose game status to describe.
 * @returns The label, or `null` when there's nothing meaningful to show.
 */
export function getGameStatusLabel(player: PlayerLike): string | null {
  const status = player.gameStatus?.toLowerCase?.() ?? '';

  if ((status === 'pregame' || status === 'pre') && player.gameStartTime) {
    return formatKickoffTime(player.gameStartTime);
  }

  if (status === 'in_progress' || status === 'in' || status === 'in-progress') {
    const quarter = player.gameQuarter?.trim() || null;
    const clock = player.gameClock?.trim() || null;
    if (quarter || clock) {
      return [quarter, clock].filter(Boolean).join(' ').trim();
    }
  }

  if (status === 'final' || status === 'post') {
    const detail = player.gameQuarter?.trim();
    return detail && detail.length > 0 ? detail : 'Final';
  }

  return null;
}

/**
 * Estimates the percentage of game time remaining for an in-progress
 * game, from the quarter and clock. Assumes 4 x 15-minute quarters.
 *
 * @param player - The player whose game to measure.
 * @returns A percentage in [0, 100], or `null` when the game isn't live
 *   or the clock can't be parsed.
 */
export function getGamePercentRemaining(player: PlayerLike): number | null {
  const status = player.gameStatus?.toLowerCase?.() ?? '';
  if (status !== 'in_progress' && status !== 'in' && status !== 'in-progress') {
    return null;
  }

  const quarterRaw = player.gameQuarter?.trim() ?? '';
  const quarterMatch = quarterRaw.match(/(\d+)/);
  if (!quarterMatch) {
    return null;
  }

  const quarterNumber = Number.parseInt(quarterMatch[1], 10);
  if (Number.isNaN(quarterNumber) || quarterNumber <= 0) {
    return null;
  }

  const minutesPerQuarter = 15;
  const totalQuarters = 4;
  const totalMinutes = minutesPerQuarter * totalQuarters;

  const normalizedQuarter = Math.min(Math.max(quarterNumber, 1), totalQuarters);
  const remainingFullQuarters = Math.max(0, totalQuarters - normalizedQuarter);

  const clockRaw = player.gameClock?.trim() ?? '';
  const clockMatch = clockRaw.match(/^(\d{1,2}):(\d{2})$/);
  let minutesRemainingInCurrentQuarter = 0;
  if (clockMatch) {
    const minutes = Number.parseInt(clockMatch[1], 10);
    const seconds = Number.parseInt(clockMatch[2], 10);
    if (!Number.isNaN(minutes) && minutes >= 0 && !Number.isNaN(seconds) && seconds >= 0) {
      minutesRemainingInCurrentQuarter = minutes + seconds / 60;
    }
  }

  const remainingMinutes =
    remainingFullQuarters * minutesPerQuarter + minutesRemainingInCurrentQuarter;
  const percentageRemaining = (remainingMinutes / totalMinutes) * 100;

  return Math.max(0, Math.min(100, percentageRemaining));
}

type ProjectableGamePlayer = PlayerLike &
  Pick<Player | GroupedPlayer, 'score' | 'projectedPoints'>;

/**
 * Estimates a player's remaining fantasy points live, by assuming their
 * pregame projection is earned evenly across the game clock: multiply the
 * full projection by the share of the game still left, then add what
 * they've already scored. A player projected for 20 with 30% of the game
 * remaining and 8 points already in the bank reads as `20 * 0.3 + 8 = 14`.
 *
 * Before kickoff (or when the live clock can't be parsed) this is just
 * the pregame projection. Once the game is final there is nothing left
 * to project, so this returns `null` and callers should fall back to the
 * actual score.
 *
 * @param player - The player to estimate.
 * @returns The live-adjusted projection, or `null` when there is no
 *   projection to show (none was computed, or the game is over).
 */
export function getLiveProjectedPoints(player: ProjectableGamePlayer): number | null {
  if (typeof player.projectedPoints !== 'number') {
    return null;
  }

  const status = player.gameStatus?.toLowerCase?.() ?? '';
  if (status === 'final' || status === 'post') {
    return null;
  }

  const percentRemaining = getGamePercentRemaining(player);
  if (percentRemaining === null) {
    // Pregame, or a live game whose clock we couldn't parse — the
    // pregame projection is the best estimate available either way.
    return player.projectedPoints;
  }

  return player.score + player.projectedPoints * (percentRemaining / 100);
}

/** The coarse state of a player's real-life game. */
export type GamePhase = 'pregame' | 'live' | 'final' | 'unknown';

/**
 * Collapses the many provider-specific `gameStatus` spellings into the
 * three states the UI actually renders differently: not started yet,
 * being played right now, and over.
 *
 * @param player - The player whose game to classify.
 * @returns The coarse phase, or `'unknown'` when the provider gave us
 *   nothing usable.
 */
export function getGamePhase(player: Pick<PlayerLike, 'gameStatus'>): GamePhase {
  const status = player.gameStatus?.toLowerCase?.() ?? '';

  if (status === 'pregame' || status === 'pre' || status === 'scheduled') {
    return 'pregame';
  }

  if (
    status === 'in_progress' ||
    status === 'in' ||
    status === 'in-progress' ||
    status === 'possession' ||
    status === 'halftime'
  ) {
    return 'live';
  }

  if (status === 'final' || status === 'post') {
    return 'final';
  }

  return 'unknown';
}
