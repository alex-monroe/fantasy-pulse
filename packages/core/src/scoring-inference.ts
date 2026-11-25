/**
 * Infers a league's scoring rules from past weeks, used when the provider's
 * settings can't be read.
 *
 * Each observation pairs a player's official points for a week, as the
 * provider scored them, with his stat line for that week from Sleeper's
 * public weekly stats. The rules are fitted by **constrained coordinate
 * descent**:
 *
 * 1. Start from the platform's default scoring.
 * 2. For one rule at a time, try every value the platform actually offers
 *    (its catalog), and keep the one that reproduces the most player-weeks
 *    exactly. Ties go to the smallest squared error, then to the default.
 * 3. Repeat until a full pass changes nothing.
 *
 * Restricting each rule to the values the platform offers keeps the fit
 * honest with small samples: an unconstrained least-squares fit would turn
 * one stat correction into a 0.47-point reception.
 *
 * A rule whose value doesn't change the fit at all (nobody threw for 400
 * yards, so the 400-yard bonus is untested) is kept at the platform default
 * and reported in `assumed`.
 *
 * Team defenses are left out: their points-allowed bands don't line up
 * across platforms, and the live feed doesn't score them anyway.
 */

import { withDerivedStats } from './live-feed';
import { scoreStatLine } from './sleeper';
import { OTTONEU_BASE_SCORING, OTTONEU_PPR_OPTIONS, type ScoringInferenceDetails } from './league-scoring';
import type { FantasyProvider } from './types';

/** One player-week: what the provider scored him and what he did. */
export type ScoringObservation = {
  /** His stat line for the week, in Sleeper keys (Sleeper's weekly stats). */
  stats: Record<string, number>;
  position: string | null;
  /** The provider's official points for the week. */
  points: number;
  week?: number;
};

/** One tunable rule: the Sleeper keys it sets together and the values the platform offers. */
export type ScoringParameter = {
  id: string;
  label: string;
  keys: string[];
  options: number[];
};

/** A platform's default scoring and the rules a commissioner can change. */
export type ScoringCatalog = {
  base: Record<string, number>;
  parameters: ScoringParameter[];
};

/** Two scores this close count as the same (providers round to hundredths). */
export const MATCH_TOLERANCE = 0.051;

/** The yardage/TD/bonus rules every mainstream platform lets a commissioner change. */
const COMMON_PARAMETERS: ScoringParameter[] = [
  { id: 'rec', label: 'Reception', keys: ['rec'], options: [0, 0.25, 0.5, 1] },
  { id: 'pass_yd', label: 'Passing yard', keys: ['pass_yd'], options: [0.04, 0.05, 0.1, 0.033333] },
  { id: 'pass_td', label: 'Passing TD', keys: ['pass_td'], options: [4, 5, 6] },
  { id: 'pass_int', label: 'Interception', keys: ['pass_int'], options: [-2, -1, -3, -4, 0] },
  { id: 'rush_yd', label: 'Rushing yard', keys: ['rush_yd'], options: [0.1, 0.05, 0.2] },
  { id: 'rush_td', label: 'Rushing TD', keys: ['rush_td'], options: [6, 4, 7] },
  { id: 'rec_yd', label: 'Receiving yard', keys: ['rec_yd'], options: [0.1, 0.05, 0.2] },
  { id: 'rec_td', label: 'Receiving TD', keys: ['rec_td'], options: [6, 4, 7] },
  { id: 'bonus_rec_te', label: 'TE reception bonus', keys: ['bonus_rec_te'], options: [0, 0.5, 1] },
  { id: 'fum_lost', label: 'Fumble lost', keys: ['fum_lost'], options: [-2, -1, 0, -3] },
  { id: 'pass_2pt', label: 'Passing 2-pt', keys: ['pass_2pt'], options: [2, 1] },
  { id: 'pass_cmp', label: 'Completion', keys: ['pass_cmp'], options: [0, 0.25, 0.5, 1] },
  { id: 'pass_inc', label: 'Incompletion', keys: ['pass_inc'], options: [0, -0.5, -1] },
  { id: 'pass_sack', label: 'Sacked', keys: ['pass_sack'], options: [0, -0.5, -1] },
  { id: 'rush_att', label: 'Rush attempt', keys: ['rush_att'], options: [0, 0.1, 0.25, 0.5] },
  { id: 'bonus_pass_yd_300', label: '300+ yd passing game', keys: ['bonus_pass_yd_300'], options: [0, 1, 2, 3, 5] },
  { id: 'bonus_pass_yd_400', label: '400+ yd passing game', keys: ['bonus_pass_yd_400'], options: [0, 1, 2, 3, 5] },
  { id: 'bonus_rush_yd_100', label: '100+ yd rushing game', keys: ['bonus_rush_yd_100'], options: [0, 1, 2, 3, 5] },
  { id: 'bonus_rush_yd_200', label: '200+ yd rushing game', keys: ['bonus_rush_yd_200'], options: [0, 1, 2, 3, 5] },
  { id: 'bonus_rec_yd_100', label: '100+ yd receiving game', keys: ['bonus_rec_yd_100'], options: [0, 1, 2, 3, 5] },
  { id: 'bonus_rec_yd_200', label: '200+ yd receiving game', keys: ['bonus_rec_yd_200'], options: [0, 1, 2, 3, 5] },
  { id: 'fgm_40_49', label: 'FG 40-49', keys: ['fgm_40_49'], options: [3, 4, 5] },
  { id: 'fgm_50p', label: 'FG 50+', keys: ['fgm_50_59', 'fgm_60p'], options: [5, 4, 6, 3] },
  { id: 'fgmiss', label: 'FG missed', keys: ['fgmiss'], options: [0, -1, -2] },
  { id: 'xpmiss', label: 'PAT missed', keys: ['xpmiss'], options: [0, -1] },
];

/** The skill-position and kicking defaults shared by Yahoo's and ESPN's standard leagues. */
const MAINSTREAM_BASE: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 0.5,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50_59: 5,
  fgm_60p: 5,
  xpm: 1,
};

/**
 * Each platform's default scoring and what its commissioners can change.
 *
 * - **Yahoo:** half PPR by default; INT -1, fumble lost -2.
 * - **ESPN:** PPR by default since 2023; INT -2, missed FG -1.
 * - **Ottoneu:** all fixed except reception value (0, 0.5 or 1).
 */
export const SCORING_CATALOGS: Partial<Record<FantasyProvider, ScoringCatalog>> = {
  yahoo: { base: { ...MAINSTREAM_BASE }, parameters: COMMON_PARAMETERS },
  espn: {
    base: { ...MAINSTREAM_BASE, rec: 1, pass_int: -2, fgmiss: -1, xpmiss: -1, fgm_50_59: 5, fgm_60p: 5 },
    parameters: COMMON_PARAMETERS,
  },
  ottoneu: {
    base: { ...OTTONEU_BASE_SCORING, rec: 0.5 },
    parameters: [{ id: 'rec', label: 'Reception', keys: ['rec'], options: [...OTTONEU_PPR_OPTIONS] }],
  },
};

const isDefense = (position: string | null | undefined) => {
  const letters = (position ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return letters.startsWith('DEF') || letters === 'DST' || letters === 'DS';
};

/**
 * Whether an observation can tell us anything: a skill player or kicker
 * who either recorded stats or was scored points.
 */
export function isUsableObservation(observation: ScoringObservation): boolean {
  if (isDefense(observation.position)) return false;
  if (!Number.isFinite(observation.points)) return false;
  const hasStats = Object.entries(observation.stats ?? {}).some(
    ([key, value]) => typeof value === 'number' && value !== 0 && !key.startsWith('pts_') && !key.startsWith('pos_rank')
  );
  return hasStats || observation.points !== 0;
}

/**
 * Errors beyond this many points count as this many: a stat correction or a
 * mismatched player shouldn't outweigh everyone the rules do explain.
 */
const LOSS_CAP = 2;

/**
 * What moving one rule off the platform default costs, in squared points.
 * Small next to a real misfit; enough that a rule the data can't pin down
 * stays at the default instead of drifting to a coincidental value.
 */
const CHANGE_PENALTY = 0.5;

type Fit = { matches: number; loss: number };

const better = (a: Fit, b: Fit) => a.loss < b.loss - 1e-9 || (Math.abs(a.loss - b.loss) <= 1e-9 && a.matches > b.matches);

function withParameter(settings: Record<string, number>, parameter: ScoringParameter, value: number) {
  const next = { ...settings };
  for (const key of parameter.keys) {
    if (value === 0) delete next[key];
    else next[key] = value;
  }
  return next;
}

/**
 * Solves `A x = b` by Gaussian elimination with partial pivoting.
 * Returns null for a singular system.
 */
function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** The result of an inference run. */
export type ScoringInference = ScoringInferenceDetails & {
  settings: Record<string, number>;
  /** Rules the fit moved away from the platform default. */
  changed: { id: string; label: string; from: number; to: number }[];
};

/**
 * Fits a league's scoring rules to its past weeks.
 *
 * Scoring is linear in the stats, so each rule becomes one feature column
 * (the summed stats its keys cover) and the search scores a candidate by
 * adjusting the current predictions rather than re-scoring every stat line.
 *
 * @param provider - The platform, which picks the catalog.
 * @param observations - Player-weeks with official points and Sleeper stat lines.
 * @param options.throughWeek - The last completed week used, for the record.
 * @param options.maxMoves - Search steps per start (default 12).
 * @returns The fitted settings and how well they reproduce the sample, or
 *   null when the platform has no catalog.
 */
export function inferScoringSettings(
  provider: FantasyProvider,
  observations: ScoringObservation[],
  options: { throughWeek?: number | null; maxMoves?: number } = {}
): ScoringInference | null {
  const catalog = SCORING_CATALOGS[provider];
  if (!catalog) return null;

  const sample = observations.filter(isUsableObservation);
  const maxMoves = options.maxMoves ?? 12;
  const n = sample.length;
  const derived = sample.map((o) => withDerivedStats(o.stats, o.position));
  const targets = Float64Array.from(sample, (o) => o.points);

  // Points from the rules the platform doesn't let commissioners change.
  const tunableKeys = new Set(catalog.parameters.flatMap((p) => p.keys));
  const fixed = Object.fromEntries(Object.entries(catalog.base).filter(([key]) => !tunableKeys.has(key)));
  const fixedPoints = Float64Array.from(derived, (stats) => scoreStatLine(stats, fixed) ?? 0);

  // One feature column per tunable rule; rules no observation touches can't move the fit.
  const columns = catalog.parameters.map((p) =>
    Float64Array.from(derived, (stats) => p.keys.reduce((sum, key) => sum + (stats[key] ?? 0), 0))
  );
  const relevant = catalog.parameters
    .map((parameter, index) => ({ parameter, column: columns[index], index }))
    .filter(({ column }) => column.some((value) => value !== 0));
  const baseValue = (p: ScoringParameter) => catalog.base[p.keys[0]] ?? 0;

  type State = { values: number[]; predictions: Float64Array; fit: Fit };

  const fitOf = (predictions: Float64Array, values: number[]): Fit => {
    let matches = 0;
    let loss = 0;
    relevant.forEach(({ parameter }, r) => {
      if (values[r] !== baseValue(parameter)) loss += CHANGE_PENALTY;
    });
    for (let i = 0; i < n; i += 1) {
      const error = Math.abs(predictions[i] - targets[i]);
      if (error <= MATCH_TOLERANCE) matches += 1;
      const capped = Math.min(error, LOSS_CAP);
      loss += capped * capped;
    }
    return { matches, loss };
  };

  const stateFor = (values: number[]): State => {
    const predictions = Float64Array.from(fixedPoints);
    relevant.forEach(({ column }, r) => {
      for (let i = 0; i < n; i += 1) predictions[i] += values[r] * column[i];
    });
    return { values, predictions, fit: fitOf(predictions, values) };
  };

  // A candidate move: change up to two rules. Scored without rebuilding the state.
  const scratch = new Float64Array(n);
  const tryMove = (state: State, changes: [number, number][]): Fit => {
    scratch.set(state.predictions);
    const values = [...state.values];
    for (const [r, value] of changes) {
      const delta = value - state.values[r];
      const column = relevant[r].column;
      for (let i = 0; i < n; i += 1) scratch[i] += delta * column[i];
      values[r] = value;
    }
    return fitOf(scratch, values);
  };

  // Each step takes the best move among every single-rule and two-rule
  // change. Two-rule moves matter: passing TD and interception values, say,
  // only explain a QB's score together, and a one-at-a-time search would
  // reach for the wrong single rule first.
  const descend = (startValues: number[]): State => {
    let state = stateFor(startValues);
    for (let move = 0; move < maxMoves; move += 1) {
      let best: { changes: [number, number][]; fit: Fit } | null = null;
      for (let a = 0; a < relevant.length; a += 1) {
        for (const va of relevant[a].parameter.options) {
          if (va === state.values[a]) continue;
          const single: [number, number][] = [[a, va]];
          const singleFit = tryMove(state, single);
          if (better(singleFit, best?.fit ?? state.fit)) best = { changes: single, fit: singleFit };
          for (let b = a + 1; b < relevant.length; b += 1) {
            for (const vb of relevant[b].parameter.options) {
              if (vb === state.values[b]) continue;
              const pair: [number, number][] = [[a, va], [b, vb]];
              const pairFit = tryMove(state, pair);
              if (better(pairFit, best?.fit ?? state.fit)) best = { changes: pair, fit: pairFit };
            }
          }
        }
      }
      if (!best) break;
      const values = [...state.values];
      for (const [r, value] of best.changes) values[r] = value;
      state = stateFor(values);
    }
    return state;
  };

  // A ridge least-squares fit pulled toward the defaults, each rule snapped to its nearest allowed value.
  const leastSquaresStart = (): number[] => {
    const k = relevant.length;
    const ata = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const atb = new Array<number>(k).fill(0);
    const ridge = 0.5;
    for (let i = 0; i < n; i += 1) {
      const target = targets[i] - fixedPoints[i];
      for (let a = 0; a < k; a += 1) {
        const xa = relevant[a].column[i];
        if (xa === 0) continue;
        atb[a] += xa * target;
        for (let b = 0; b < k; b += 1) ata[a][b] += xa * relevant[b].column[i];
      }
    }
    relevant.forEach(({ parameter }, a) => {
      ata[a][a] += ridge;
      atb[a] += ridge * baseValue(parameter);
    });
    const solution = solveLinear(ata, atb);
    return relevant.map(({ parameter }, a) => {
      if (!solution) return baseValue(parameter);
      return parameter.options.reduce((best, option) =>
        Math.abs(option - solution[a]) < Math.abs(best - solution[a]) ? option : best
      );
    });
  };

  const baseValues = relevant.map(({ parameter }) => baseValue(parameter));
  let winner = stateFor(baseValues);

  if (n > 0 && relevant.length > 0) {
    // Two starts: the platform default and the snapped least-squares fit.
    const fromBase = descend(baseValues);
    const fromLeastSquares = descend(leastSquaresStart());
    winner = better(fromLeastSquares.fit, fromBase.fit) ? fromLeastSquares : fromBase;

    // Escape local minima: put each changed rule back to its default and
    // search again from there, keeping any improvement. An early step can
    // grab a rule that only half-explains the data (passing yards standing
    // in for passing TDs), leaving the true answer three changes away.
    for (let round = 0; round < relevant.length; round += 1) {
      const current = winner;
      const candidates = relevant
        .map(({ parameter }, r) => ({ parameter, r }))
        .filter(({ parameter, r }) => current.values[r] !== baseValue(parameter))
        .map(({ parameter, r }) => {
          const values = [...current.values];
          values[r] = baseValue(parameter);
          return descend(values);
        });
      const best = candidates.reduce<State | null>(
        (top, candidate) => (better(candidate.fit, top?.fit ?? current.fit) ? candidate : top),
        null
      );
      if (!best) break;
      winner = best;
    }
  }

  let settings = { ...catalog.base };
  relevant.forEach(({ parameter }, r) => {
    settings = withParameter(settings, parameter, winner.values[r]);
  });

  const relevantIds = new Set(relevant.map(({ parameter }) => parameter.id));
  const assumed = catalog.parameters.filter((p) => !relevantIds.has(p.id)).map((p) => p.label);

  const changed = catalog.parameters
    .map((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      from: baseValue(parameter),
      to: settings[parameter.keys[0]] ?? 0,
    }))
    .filter((change) => change.from !== change.to);

  return {
    settings,
    sampleSize: n,
    matchRate: n > 0 ? Math.round((winner.fit.matches / n) * 10000) / 10000 : 0,
    throughWeek: options.throughWeek ?? null,
    assumed,
    changed,
  };
}
