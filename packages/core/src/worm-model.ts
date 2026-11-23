/**
 * The constants and math of ottoneu-db's live score worm model, shared by
 * the matchup projection (`matchup-projection.ts`) and the play-by-play
 * worm (`live-feed.ts`). Kept dependency-free so neither imports the other.
 *
 * See ottoneu-db `scripts/rebuild_score_worm.py` (`WinModel`) and
 * `docs/references/matchups-and-standings.md` for where the numbers come
 * from and how they were calibrated.
 */

/** ottoneu-db's `WORM_LINEUP_SD`: a full lineup's spread around its projection, in points. */
export const WORM_LINEUP_SD = 20.3;

/** Starters in the lineups `WORM_LINEUP_SD` was fitted on (QB, 2 RB, 2 WR, TE, FLEX, K). */
export const WORM_LINEUP_STARTERS = 8;

/**
 * One starter's share of a lineup's variance for a whole game, in points².
 * A lineup's variance is this × each starter's share of his game still to
 * play, summed — for an 8-starter lineup whose games all run the same
 * length that is exactly `WORM_LINEUP_SD² × (1 − progress)`, ottoneu-db's
 * model, and lineups of other sizes get the same per-player uncertainty.
 */
export const WORM_STARTER_VARIANCE = WORM_LINEUP_SD ** 2 / WORM_LINEUP_STARTERS;

/** The central 80% of a normal distribution is ±1.2816 standard deviations. */
export const CONE_Z = 1.2816;

/**
 * The cumulative distribution function of the standard normal, via the
 * Abramowitz & Stegun 7.1.26 error-function approximation (max error
 * ~1.5e-7 — far tighter than anything a fantasy projection deserves).
 */
export const normalCdf = (z: number): number => {
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
