import {
  getGamePercentRemaining,
  getGamePhase,
  getLiveProjectedPoints,
} from './player-status';
import type { Player, Team } from './types';

/**
 * How noisy a week of fantasy scoring is for each position, expressed as
 * a coefficient of variation against the player's projection: a receiver
 * projected for 12 lands roughly 8 points either side of it in a typical
 * week, a quarterback projected for 20 lands within 8.
 *
 * These are rules of thumb from published weekly-scoring spreads, not
 * fitted values — they exist to make the win probability move at a
 * sensible speed, not to be the last word on any one player.
 */
const POSITION_VOLATILITY: Record<string, number> = {
  QB: 0.4,
  RB: 0.55,
  WR: 0.65,
  TE: 0.7,
  K: 0.55,
  DEF: 0.75,
  DST: 0.75,
};

/** Applied to any position the table above doesn't name (FLEX slots, oddities). */
const DEFAULT_VOLATILITY = 0.6;

/**
 * The floor on one starter's spread, in points, for a full game. Without
 * it a starter projected for 1.5 reads as a certainty, when in practice
 * that's exactly the player who hangs 18 on you.
 */
const MIN_PLAYER_SIGMA = 2.5;

/**
 * The spread assigned to a starter with a game left but no projection.
 * They contribute nothing to the projected total — we have no estimate
 * to add — but they are still football yet to be played, so they widen
 * the distribution and pull the win probability toward a coin flip.
 */
const UNPROJECTED_PLAYER_SIGMA = 7;

const normalizePosition = (position: string | undefined): string => {
  const letters = (position ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (letters.startsWith('DEF') || letters === 'DST' || letters === 'DS') {
    return 'DST';
  }
  return letters;
};

const getPositionVolatility = (position: string | undefined): number =>
  POSITION_VOLATILITY[normalizePosition(position)] ?? DEFAULT_VOLATILITY;

/**
 * The share of a player's game still to be played, in [0, 1]. Mirrors
 * the assumption {@link getLiveProjectedPoints} makes — points are earned
 * evenly across the clock — so the two stay consistent.
 */
const getRemainingShare = (player: Player): number => {
  const phase = getGamePhase(player);
  if (phase === 'final') {
    return 0;
  }
  if (phase === 'live') {
    const percentRemaining = getGamePercentRemaining(player);
    return percentRemaining === null ? 1 : percentRemaining / 100;
  }
  // Pregame, or a status we don't recognize: assume the whole game is ahead.
  return 1;
};

/**
 * The cumulative distribution function of the standard normal, via the
 * Abramowitz & Stegun 7.1.26 error-function approximation (max error
 * ~1.5e-7 — far tighter than anything a fantasy projection deserves).
 */
const normalCdf = (z: number): number => {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);

  return 0.5 * (1 + sign * erf);
};

/** Where one roster is expected to finish the week. */
export interface RosterProjection {
  /** Points already banked — the provider's own total for the roster. */
  current: number;
  /** Points still expected from starters whose games aren't over. */
  remaining: number;
  /** `current + remaining`: the projected final score. */
  projected: number;
  /** Starters on the roster, whatever state their game is in. */
  starters: number;
  /** Starters with football left that carried a usable projection. */
  projectedStarters: number;
  /**
   * Starters with football left that had no projection to add. Their
   * points are missing from `projected`, so a roster with any of these
   * is projected low.
   */
  unprojectedStarters: number;
  /** The spread on `remaining`, one standard deviation, in points. */
  standardDeviation: number;
}

/**
 * Projects a roster's final score by adding up what each starter still
 * has left to earn, on top of the score the provider already reports.
 *
 * Built on the remaining points rather than on a sum of per-player
 * projections on purpose: a roster's reported total carries bonuses,
 * corrections and scoring quirks that a naive sum of player scores
 * misses, so starting from it keeps the projection anchored to the
 * number the user sees on the provider's own site.
 *
 * @param players - The roster, starters and bench alike; bench players
 *   are skipped.
 * @param currentScore - The roster's score right now.
 * @returns The projected finish, with the spread around it.
 */
export const projectRoster = (
  players: Player[] | undefined,
  currentScore: number
): RosterProjection => {
  let remaining = 0;
  let variance = 0;
  let starters = 0;
  let projectedStarters = 0;
  let unprojectedStarters = 0;

  (players ?? []).forEach((player) => {
    if (!player || player.onBench) {
      return;
    }

    starters += 1;

    const remainingShare = getRemainingShare(player);
    if (remainingShare <= 0) {
      return;
    }

    const liveProjection = getLiveProjectedPoints(player);
    if (liveProjection === null) {
      unprojectedStarters += 1;
      variance += (UNPROJECTED_PLAYER_SIGMA * remainingShare) ** 2;
      return;
    }

    const playerRemaining = Math.max(0, liveProjection - (player.score ?? 0));
    remaining += playerRemaining;
    projectedStarters += 1;

    const sigma = Math.max(
      getPositionVolatility(player.position) * playerRemaining,
      MIN_PLAYER_SIGMA * remainingShare
    );
    variance += sigma ** 2;
  });

  return {
    current: currentScore,
    remaining,
    projected: currentScore + remaining,
    starters,
    projectedStarters,
    unprojectedStarters,
    standardDeviation: Math.sqrt(variance),
  };
};

/** Both sides of a matchup projected forward, plus the odds that follow. */
export interface MatchupProjection {
  /** The user's roster. */
  team: RosterProjection;
  /** The opponent's roster. */
  opponent: RosterProjection;
  /** Projected final margin: the user's projection minus the opponent's. */
  differential: number;
  /**
   * The chance the user finishes ahead, in [0, 1]. Treats the final
   * margin as normally distributed around `differential`, with the two
   * rosters' spreads added in quadrature.
   */
  winProbability: number;
  /**
   * Whether there is enough to show. False when a roster came back empty
   * or nothing on either side carried a projection — showing a number
   * then would be inventing one.
   */
  hasProjections: boolean;
  /** Whether every starter's game is over, so the result is already decided. */
  settled: boolean;
  /**
   * Starters across both rosters that still have a game to play but no
   * projection behind them. Any of these and both projected totals are
   * understated; the win probability widens to account for it.
   */
  unprojectedStarters: number;
}

/**
 * Projects a whole matchup — both rosters, not just the user's — and
 * turns the gap between the two projections into a win probability.
 *
 * The probability models the final margin as a normal distribution
 * centred on the projected margin, with a spread built from how much
 * football is left and how volatile the positions still playing are.
 * Two simplifications worth knowing about: players are treated as
 * scoring independently (a QB/WR stack really moves together), and a
 * starter with no projection contributes uncertainty but no points.
 *
 * @param team - The user's team, with its opponent attached.
 * @returns Both projections, the projected margin, and the win probability.
 */
export const projectMatchup = (team: Team): MatchupProjection => {
  const mine = projectRoster(team.players, team.totalScore ?? 0);
  const theirs = projectRoster(team.opponent?.players, team.opponent?.totalScore ?? 0);

  const differential = mine.projected - theirs.projected;
  const standardDeviation = Math.hypot(mine.standardDeviation, theirs.standardDeviation);

  const winProbability =
    standardDeviation > 0
      ? normalCdf(differential / standardDeviation)
      : differential > 0
        ? 1
        : differential < 0
          ? 0
          : 0.5;

  const startersLeft =
    mine.projectedStarters +
    mine.unprojectedStarters +
    theirs.projectedStarters +
    theirs.unprojectedStarters;
  const settled = startersLeft === 0;

  // Both rosters have to be populated for the comparison to mean
  // anything: if a provider handed back an empty opponent roster, every
  // point we project for the user would read as free.
  const bothRostersPresent = mine.starters > 0 && theirs.starters > 0;

  return {
    team: mine,
    opponent: theirs,
    differential,
    winProbability,
    hasProjections:
      bothRostersPresent &&
      (settled || mine.projectedStarters + theirs.projectedStarters > 0),
    settled,
    unprojectedStarters: mine.unprojectedStarters + theirs.unprojectedStarters,
  };
};

/**
 * Renders a win probability for display, keeping the extremes honest: a
 * matchup that is merely lopsided reads `>99%`, and only one that is
 * actually over reads `100%`.
 *
 * @param probability - The win probability, in [0, 1].
 * @param settled - Whether every game in the matchup is final.
 * @returns The percentage as a display string.
 */
export const formatWinProbability = (probability: number, settled = false): string => {
  const clamped = Math.min(Math.max(probability, 0), 1);

  if (settled) {
    return `${Math.round(clamped * 100)}%`;
  }
  if (clamped >= 0.995) {
    return '>99%';
  }
  if (clamped <= 0.005) {
    return '<1%';
  }
  return `${Math.round(clamped * 100)}%`;
};
