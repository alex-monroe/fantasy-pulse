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
