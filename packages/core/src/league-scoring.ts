/**
 * A league's scoring rules, in Sleeper's stat keys, for any provider.
 *
 * Sleeper hands us `scoring_settings` directly. The other providers
 * publish their rules in their own shapes, which this module translates
 * into Sleeper keys so the same scorers (`scoreStatLine`,
 * `scoreLiveStats`) work everywhere:
 *
 * - **Yahoo:** `league/{key}/settings`, which has `stat_categories` and
 *   `stat_modifiers` ({@link translateYahooScoring})
 * - **ESPN:** `view=mSettings`, which has `settings.scoringSettings.scoringItems`
 *   ({@link translateEspnScoring})
 * - **Ottoneu:** the public league settings page. Everything is fixed
 *   except points per reception ({@link ottoneuScoring})
 *
 * When a read fails, `scoring-inference.ts` fits the rules from past weeks
 * instead. A rule with no Sleeper equivalent is never dropped silently:
 * it is listed in `unmapped`, so the league page can show what we couldn't
 * translate.
 *
 * Kicks use `fgm_50_59` + `fgm_60p` rather than `fgm_50p`, because those
 * are the keys the live play-by-play feed emits. Sleeper's weekly stats
 * carry them too.
 */

import type { FantasyProvider } from './types';

/** Where a league's scoring settings came from. */
export type ScoringSource = 'unknown' | 'provider' | 'inferred';

/** A provider rule we could not express in Sleeper keys. */
export type UnmappedScoringRule = { label: string; value: number };

/** How an inferred scoring fit went. */
export type ScoringInferenceDetails = {
  /** Player-weeks used for the fit. */
  sampleSize: number;
  /** Share of those player-weeks the fitted settings reproduce exactly. */
  matchRate: number;
  /** The last completed NFL week the fit used. */
  throughWeek: number | null;
  /** Rules the data never tested, left at the platform's default. */
  assumed: string[];
};

/** A league's scoring settings, as stored and as shown. */
export type LeagueScoring = {
  source: ScoringSource;
  /** Sleeper stat key -> points. Empty when `source` is 'unknown'. */
  settings: Record<string, number>;
  unmapped: UnmappedScoringRule[];
  inference?: ScoringInferenceDetails | null;
  /** When the settings were last read or inferred (ISO). */
  checkedAt?: string | null;
  /** Why the provider read failed, when it did. */
  readError?: string | null;
};

/** Inferred settings this good are trusted to score live plays. */
export const INFERENCE_TRUST_MATCH_RATE = 0.9;
export const INFERENCE_TRUST_MIN_SAMPLE = 20;

/**
 * Whether stored scoring is good enough to score a league's plays and
 * projections, in place of a stock profile.
 */
export function isScoringTrusted(scoring: LeagueScoring | null | undefined): boolean {
  if (!scoring || Object.keys(scoring.settings).length === 0) return false;
  if (scoring.source === 'provider') return true;
  if (scoring.source === 'inferred') {
    const fit = scoring.inference;
    return Boolean(
      fit && fit.matchRate >= INFERENCE_TRUST_MATCH_RATE && fit.sampleSize >= INFERENCE_TRUST_MIN_SAMPLE
    );
  }
  return false;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Sets a value, skipping zeros (an unscored stat needs no key). */
function put(settings: Record<string, number>, key: string, value: number) {
  if (!Number.isFinite(value)) return;
  if (value === 0) {
    delete settings[key];
    return;
  }
  settings[key] = round(value);
}

// --- Ottoneu ---------------------------------------------------------------------

/**
 * Ottoneu's fixed scoring, everything except receptions. It matches
 * ottoneu-db's `SCORING_SETTINGS` + `SCORING_EXTRAS`, which reproduce
 * Ottoneu's box scores to the hundredth. Ottoneu has no team defense.
 */
export const OTTONEU_BASE_SCORING: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 1,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
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
  fgmiss: -1,
  xpm: 1,
  xpmiss: -1,
};

/** Ottoneu's three scoring options: points per reception. */
export const OTTONEU_PPR_OPTIONS = [0, 0.5, 1] as const;

/**
 * Reads points per reception from the "Points System" value on Ottoneu's
 * league settings page ("1.0 PPR", "0.5 PPR", "Half PPR", "Standard").
 *
 * @returns 0, 0.5 or 1, or null when the text isn't recognised.
 */
export function parseOttoneuPointsSystem(text: string | null | undefined): number | null {
  const value = (text ?? '').trim().toLowerCase();
  if (!value) return null;
  if (/half/.test(value)) return 0.5;
  if (/standard|non[- ]?ppr|\bno ppr\b/.test(value)) return 0;
  const numeric = value.match(/(\d*\.?\d+)\s*ppr/);
  if (numeric) {
    const ppr = Number.parseFloat(numeric[1]);
    return (OTTONEU_PPR_OPTIONS as readonly number[]).includes(ppr) ? ppr : null;
  }
  if (/\bppr\b/.test(value)) return 1;
  return null;
}

/** An Ottoneu league's full scoring for a given points-per-reception. */
export function ottoneuScoring(ppr: number): Record<string, number> {
  const settings = { ...OTTONEU_BASE_SCORING };
  put(settings, 'rec', ppr);
  return settings;
}

// --- ESPN ------------------------------------------------------------------------

/** ESPN statIds that map one-to-one onto Sleeper keys (from espn-api's PLAYER_STATS_MAP). */
const ESPN_DIRECT: Record<number, string[]> = {
  0: ['pass_att'],
  1: ['pass_cmp'],
  2: ['pass_inc'],
  3: ['pass_yd'],
  4: ['pass_td'],
  15: ['pass_td_40p'],
  16: ['pass_td_50p'],
  19: ['pass_2pt'],
  20: ['pass_int'],
  23: ['rush_att'],
  24: ['rush_yd'],
  25: ['rush_td'],
  26: ['rush_2pt'],
  35: ['rush_td_40p'],
  36: ['rush_td_50p'],
  42: ['rec_yd'],
  43: ['rec_td'],
  44: ['rec_2pt'],
  45: ['rec_td_40p'],
  46: ['rec_td_50p'],
  53: ['rec'],
  58: ['rec_tgt'],
  64: ['pass_sack'],
  68: ['fum'],
  72: ['fum_lost'],
  77: ['fgm_40_49'],
  80: ['fgm_0_19', 'fgm_20_29', 'fgm_30_39'],
  85: ['fgmiss'],
  86: ['xpm'],
  88: ['xpmiss'],
  89: ['pts_allow_0'],
  90: ['pts_allow_1_6'],
  91: ['pts_allow_7_13'],
  94: ['def_td'],
  95: ['int'],
  96: ['fum_rec'],
  97: ['blk_kick'],
  98: ['safe'],
  99: ['sack'],
  106: ['ff'],
  123: ['pts_allow_28_34'],
};

/** ESPN's tiered yardage-game bonuses: [lower tier id, upper tier id, Sleeper keys]. */
const ESPN_YARDAGE_TIERS: [number, number, string, string][] = [
  [17, 18, 'bonus_pass_yd_300', 'bonus_pass_yd_400'],
  [37, 38, 'bonus_rush_yd_100', 'bonus_rush_yd_200'],
  [56, 57, 'bonus_rec_yd_100', 'bonus_rec_yd_200'],
];

/** ESPN lineup slot ids for the reception premiums. */
const ESPN_RECEPTION_SLOT_BONUS: Record<string, string> = {
  '2': 'bonus_rec_rb',
  '4': 'bonus_rec_wr',
  '6': 'bonus_rec_te',
};

/** Human labels for the ESPN ids we can't translate, for the league page. */
const ESPN_LABELS: Record<number, string> = {
  5: 'Every 5 passing yards',
  6: 'Every 10 passing yards',
  7: 'Every 20 passing yards',
  8: 'Every 25 passing yards',
  9: 'Every 50 passing yards',
  10: 'Every 100 passing yards',
  21: 'Completion percentage',
  27: 'Every 5 rushing yards',
  28: 'Every 10 rushing yards',
  29: 'Every 20 rushing yards',
  30: 'Every 25 rushing yards',
  31: 'Every 50 rushing yards',
  32: 'Every 100 rushing yards',
  41: 'Receptions (alternate)',
  47: 'Every 5 receiving yards',
  48: 'Every 10 receiving yards',
  49: 'Every 20 receiving yards',
  50: 'Every 25 receiving yards',
  51: 'Every 50 receiving yards',
  52: 'Every 100 receiving yards',
  63: 'Fumble recovered for TD',
  74: 'FG made 50+',
  76: 'FG missed 50+',
  79: 'FG missed 40-49',
  82: 'FG missed 0-39',
  92: 'Points allowed 14-17',
  93: 'Blocked kick return TD',
  101: 'Kickoff return TD',
  102: 'Punt return TD',
  103: 'Interception return TD',
  104: 'Fumble return TD',
  121: 'Points allowed 18-21',
  122: 'Points allowed 22-27',
  124: 'Points allowed 35-45',
  125: 'Points allowed 46+',
  201: 'FG made 60+',
};

type EspnScoringItem = {
  statId?: number;
  points?: number;
  pointsOverrides?: Record<string, number>;
};

/**
 * Translates an ESPN league's `settings.scoringSettings.scoringItems` into
 * Sleeper keys.
 *
 * - The tiered yardage bonuses (300-399 / 400+) become Sleeper's cumulative
 *   milestones. Sleeper pays both at 400+, so the 400 key gets the difference.
 * - Per-slot reception overrides become Sleeper's RB/WR/TE reception premiums.
 * - Points-allowed bands are mapped where they line up with Sleeper's.
 *
 * @param scoringItems - ESPN's scoring items.
 * @returns The settings, plus every rule we couldn't translate.
 */
export function translateEspnScoring(scoringItems: EspnScoringItem[] | null | undefined): {
  settings: Record<string, number>;
  unmapped: UnmappedScoringRule[];
} {
  const settings: Record<string, number> = {};
  const unmapped: UnmappedScoringRule[] = [];
  const byId = new Map<number, EspnScoringItem>();
  for (const item of scoringItems ?? []) {
    if (typeof item?.statId === 'number') byId.set(item.statId, item);
  }
  const points = (id: number) => Number(byId.get(id)?.points ?? 0);
  const handled = new Set<number>();

  for (const [id, keys] of Object.entries(ESPN_DIRECT)) {
    const statId = Number(id);
    const item = byId.get(statId);
    if (!item) continue;
    handled.add(statId);
    for (const key of keys) put(settings, key, Number(item.points ?? 0));

    // Per-slot overrides. Only receptions have a Sleeper equivalent.
    for (const [slot, override] of Object.entries(item.pointsOverrides ?? {})) {
      const bonusKey = statId === 53 ? ESPN_RECEPTION_SLOT_BONUS[slot] : undefined;
      if (bonusKey) {
        put(settings, bonusKey, Number(override) - Number(item.points ?? 0));
      } else {
        unmapped.push({ label: `${ESPN_LABELS[statId] ?? keys.join(', ')} (lineup slot ${slot} override)`, value: Number(override) });
      }
    }
  }

  // Receptions stored under the duplicate id (41) when 53 is absent.
  if (!byId.has(53) && byId.has(41)) {
    handled.add(41);
    put(settings, 'rec', points(41));
  }

  for (const [lower, upper, lowerKey, upperKey] of ESPN_YARDAGE_TIERS) {
    if (!byId.has(lower) && !byId.has(upper)) continue;
    handled.add(lower);
    handled.add(upper);
    put(settings, lowerKey, points(lower));
    put(settings, upperKey, points(upper) - points(lower));
  }

  // FG 50+: one ESPN rule, two feed keys. A separate 60+ rule overrides the top band.
  if (byId.has(74)) {
    handled.add(74);
    put(settings, 'fgm_50_59', points(74));
    put(settings, 'fgm_60p', points(74));
  }
  if (byId.has(201)) {
    handled.add(201);
    put(settings, 'fgm_60p', points(201));
  }

  // Missed-FG bands: exact when they all agree with each other (or with the overall miss rule).
  const missBands = [76, 79, 82].filter((id) => byId.has(id));
  if (missBands.length > 0) {
    const values = new Set(missBands.map(points));
    if (values.size === 1 && (!byId.has(85) || points(85) === 0)) {
      put(settings, 'fgmiss', [...values][0]);
      missBands.forEach((id) => handled.add(id));
    }
  }

  // Points-allowed bands that don't line up with Sleeper's: map the nearest
  // and say so when the neighbours disagree.
  if (byId.has(92)) {
    handled.add(92);
    put(settings, 'pts_allow_14_20', points(92));
    if (byId.has(121) && points(121) === points(92)) handled.add(121);
  }
  if (byId.has(122)) {
    handled.add(122);
    put(settings, 'pts_allow_21_27', points(122));
  }
  if (byId.has(124)) {
    handled.add(124);
    put(settings, 'pts_allow_35p', points(124));
    if (byId.has(125) && points(125) === points(124)) handled.add(125);
  }

  for (const [statId, item] of byId) {
    if (handled.has(statId)) continue;
    const value = Number(item.points ?? 0);
    if (value === 0) continue;
    unmapped.push({ label: ESPN_LABELS[statId] ?? `ESPN stat ${statId}`, value });
  }

  return { settings, unmapped };
}

// --- Yahoo -----------------------------------------------------------------------

/**
 * Yahoo NFL stat ids. Each entry has the Sleeper keys it maps to and a
 * pattern its `stat_categories` name must match. If the name disagrees,
 * the rule is reported as unmapped rather than mapped wrong.
 */
const YAHOO_STATS: Record<number, { keys: string[]; name: RegExp; label: string }> = {
  1: { keys: ['pass_att'], name: /pass(ing)? att/i, label: 'Passing attempts' },
  2: { keys: ['pass_cmp'], name: /complet/i, label: 'Completions' },
  3: { keys: ['pass_inc'], name: /incomplet/i, label: 'Incomplete passes' },
  4: { keys: ['pass_yd'], name: /pass(ing)? y(ar)?ds/i, label: 'Passing yards' },
  5: { keys: ['pass_td'], name: /pass(ing)? (td|touchdown)/i, label: 'Passing touchdowns' },
  6: { keys: ['pass_int'], name: /intercept|^int$/i, label: 'Interceptions thrown' },
  7: { keys: ['pass_sack'], name: /sack/i, label: 'Times sacked' },
  8: { keys: ['rush_att'], name: /rush(ing)? att/i, label: 'Rushing attempts' },
  9: { keys: ['rush_yd'], name: /rush(ing)? y(ar)?ds/i, label: 'Rushing yards' },
  10: { keys: ['rush_td'], name: /rush(ing)? (td|touchdown)/i, label: 'Rushing touchdowns' },
  11: { keys: ['rec'], name: /recept|^rec$/i, label: 'Receptions' },
  12: { keys: ['rec_yd'], name: /rec(eiving)? y(ar)?ds/i, label: 'Receiving yards' },
  13: { keys: ['rec_td'], name: /rec(eiving)? (td|touchdown)/i, label: 'Receiving touchdowns' },
  16: { keys: ['pass_2pt', 'rush_2pt', 'rec_2pt'], name: /2[- ]?p(oin)?t/i, label: '2-point conversions' },
  17: { keys: ['fum'], name: /^fum(bles?)?$/i, label: 'Fumbles' },
  18: { keys: ['fum_lost'], name: /fum(bles?)? lost|fum lost/i, label: 'Fumbles lost' },
  19: { keys: ['fgm_0_19'], name: /0[- ]19/i, label: 'FG made 0-19' },
  20: { keys: ['fgm_20_29'], name: /20[- ]29/i, label: 'FG made 20-29' },
  21: { keys: ['fgm_30_39'], name: /30[- ]39/i, label: 'FG made 30-39' },
  22: { keys: ['fgm_40_49'], name: /40[- ]49/i, label: 'FG made 40-49' },
  23: { keys: ['fgm_50_59', 'fgm_60p'], name: /50\+?/i, label: 'FG made 50+' },
  24: { keys: ['fgmiss_0_19'], name: /0[- ]19/i, label: 'FG missed 0-19' },
  25: { keys: ['fgmiss_20_29'], name: /20[- ]29/i, label: 'FG missed 20-29' },
  26: { keys: ['fgmiss_30_39'], name: /30[- ]39/i, label: 'FG missed 30-39' },
  27: { keys: ['fgmiss_40_49'], name: /40[- ]49/i, label: 'FG missed 40-49' },
  28: { keys: ['fgmiss_50p'], name: /50\+?/i, label: 'FG missed 50+' },
  29: { keys: ['xpm'], name: /pat|point after|extra point/i, label: 'PAT made' },
  30: { keys: ['xpmiss'], name: /pat|point after|extra point/i, label: 'PAT missed' },
  32: { keys: ['sack'], name: /sack/i, label: 'Sacks (defense)' },
  33: { keys: ['int'], name: /intercept|^int$/i, label: 'Interceptions (defense)' },
  34: { keys: ['fum_rec'], name: /fum(ble)? rec/i, label: 'Fumble recoveries' },
  35: { keys: ['def_td'], name: /touchdown|^td$/i, label: 'Defensive touchdowns' },
  36: { keys: ['safe'], name: /safety|^safe$/i, label: 'Safeties' },
  37: { keys: ['blk_kick'], name: /block/i, label: 'Blocked kicks' },
  50: { keys: ['pts_allow_0'], name: /points? allow|pts allow/i, label: 'Points allowed 0' },
  51: { keys: ['pts_allow_1_6'], name: /points? allow|pts allow/i, label: 'Points allowed 1-6' },
  52: { keys: ['pts_allow_7_13'], name: /points? allow|pts allow/i, label: 'Points allowed 7-13' },
  53: { keys: ['pts_allow_14_20'], name: /points? allow|pts allow/i, label: 'Points allowed 14-20' },
  54: { keys: ['pts_allow_21_27'], name: /points? allow|pts allow/i, label: 'Points allowed 21-27' },
  55: { keys: ['pts_allow_28_34'], name: /points? allow|pts allow/i, label: 'Points allowed 28-34' },
  56: { keys: ['pts_allow_35p'], name: /points? allow|pts allow/i, label: 'Points allowed 35+' },
  78: { keys: ['rec_tgt'], name: /target/i, label: 'Targets' },
};

/** Yahoo yardage bonuses: stat id -> { bonus target -> Sleeper key }. */
const YAHOO_BONUSES: Record<number, Record<string, string>> = {
  4: { '300': 'bonus_pass_yd_300', '400': 'bonus_pass_yd_400' },
  9: { '100': 'bonus_rush_yd_100', '200': 'bonus_rush_yd_200' },
  12: { '100': 'bonus_rec_yd_100', '200': 'bonus_rec_yd_200' },
};

/** Yahoo nests arrays as objects keyed "0", "1", ... plus a "count". */
function yahooList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => /^\d+$/.test(key))
      .map(([, entry]) => entry);
  }
  return [];
}

/**
 * Finds the `settings` block in a Yahoo `league/{key}/settings` response.
 * Yahoo returns `fantasy_content.league` as `[leagueInfo, { settings: [ {...} ] }]`.
 */
export function findYahooSettings(payload: any): any | null {
  const league = payload?.fantasy_content?.league;
  for (const part of yahooList(league)) {
    const settings = part?.settings;
    if (settings) return Array.isArray(settings) ? settings[0] : settings;
  }
  return null;
}

/**
 * Translates a Yahoo league's settings (`stat_categories` +
 * `stat_modifiers`) into Sleeper keys.
 *
 * @param settings - The `settings` object from `league/{key}/settings`
 *   (see {@link findYahooSettings}).
 */
export function translateYahooScoring(settings: any): {
  settings: Record<string, number>;
  unmapped: UnmappedScoringRule[];
} {
  const out: Record<string, number> = {};
  const unmapped: UnmappedScoringRule[] = [];

  const names = new Map<number, string>();
  for (const entry of yahooList(settings?.stat_categories?.stats)) {
    const stat = entry?.stat;
    if (stat && stat.stat_id != null) {
      names.set(Number(stat.stat_id), String(stat.name ?? stat.display_name ?? ''));
    }
  }

  for (const entry of yahooList(settings?.stat_modifiers?.stats)) {
    const stat = entry?.stat;
    if (!stat || stat.stat_id == null) continue;
    const id = Number(stat.stat_id);
    const value = Number.parseFloat(String(stat.value ?? '0'));
    const known = YAHOO_STATS[id];
    const name = names.get(id) ?? '';
    const label = name || known?.label || `Yahoo stat ${id}`;

    if (known && (!name || known.name.test(name))) {
      for (const key of known.keys) put(out, key, value);
    } else if (value !== 0) {
      unmapped.push({ label, value });
    }

    for (const bonusEntry of yahooList(stat.bonuses)) {
      const bonus = bonusEntry?.bonus;
      if (!bonus) continue;
      const target = String(Number.parseFloat(String(bonus.target ?? '')));
      const points = Number.parseFloat(String(bonus.points ?? '0'));
      const key = known && (!name || known.name.test(name)) ? YAHOO_BONUSES[id]?.[target] : undefined;
      if (key) {
        put(out, key, points);
      } else if (points !== 0) {
        unmapped.push({ label: `${label} bonus at ${target}`, value: points });
      }
    }
  }

  // Yahoo scores missed field goals by distance. Collapse them to one key
  // when they agree, since the live feed reports misses without distance.
  const missKeys = ['fgmiss_0_19', 'fgmiss_20_29', 'fgmiss_30_39', 'fgmiss_40_49', 'fgmiss_50p'];
  const present = missKeys.filter((key) => key in out);
  if (present.length > 0) {
    const values = new Set(present.map((key) => out[key]));
    if (values.size === 1 && present.length === missKeys.length) {
      present.forEach((key) => delete out[key]);
      put(out, 'fgmiss', [...values][0]);
    }
  }

  return { settings: out, unmapped };
}

// --- Display ---------------------------------------------------------------------

/** Display groups and labels for Sleeper keys, in reading order. */
export const SCORING_DISPLAY_GROUPS: { group: string; keys: [string, string][] }[] = [
  {
    group: 'Passing',
    keys: [
      ['pass_yd', 'Passing yard'],
      ['pass_td', 'Passing TD'],
      ['pass_int', 'Interception'],
      ['pass_2pt', '2-pt conversion'],
      ['pass_att', 'Attempt'],
      ['pass_cmp', 'Completion'],
      ['pass_inc', 'Incompletion'],
      ['pass_sack', 'Sacked'],
      ['pass_td_40p', '40+ yd TD bonus'],
      ['pass_td_50p', '50+ yd TD bonus'],
      ['bonus_pass_yd_300', '300+ yd game'],
      ['bonus_pass_yd_400', '400+ yd game'],
    ],
  },
  {
    group: 'Rushing',
    keys: [
      ['rush_yd', 'Rushing yard'],
      ['rush_td', 'Rushing TD'],
      ['rush_2pt', '2-pt conversion'],
      ['rush_att', 'Attempt'],
      ['rush_td_40p', '40+ yd TD bonus'],
      ['rush_td_50p', '50+ yd TD bonus'],
      ['bonus_rush_yd_100', '100+ yd game'],
      ['bonus_rush_yd_200', '200+ yd game'],
    ],
  },
  {
    group: 'Receiving',
    keys: [
      ['rec', 'Reception'],
      ['rec_yd', 'Receiving yard'],
      ['rec_td', 'Receiving TD'],
      ['rec_2pt', '2-pt conversion'],
      ['rec_tgt', 'Target'],
      ['bonus_rec_rb', 'RB reception bonus'],
      ['bonus_rec_wr', 'WR reception bonus'],
      ['bonus_rec_te', 'TE reception bonus'],
      ['rec_td_40p', '40+ yd TD bonus'],
      ['rec_td_50p', '50+ yd TD bonus'],
      ['bonus_rec_yd_100', '100+ yd game'],
      ['bonus_rec_yd_200', '200+ yd game'],
    ],
  },
  {
    group: 'Misc',
    keys: [
      ['fum', 'Fumble'],
      ['fum_lost', 'Fumble lost'],
    ],
  },
  {
    group: 'Kicking',
    keys: [
      ['fgm_0_19', 'FG 0-19'],
      ['fgm_20_29', 'FG 20-29'],
      ['fgm_30_39', 'FG 30-39'],
      ['fgm_40_49', 'FG 40-49'],
      ['fgm_50_59', 'FG 50-59'],
      ['fgm_60p', 'FG 60+'],
      ['fgm_50p', 'FG 50+'],
      ['fgmiss', 'FG missed'],
      ['fgmiss_0_19', 'FG missed 0-19'],
      ['fgmiss_20_29', 'FG missed 20-29'],
      ['fgmiss_30_39', 'FG missed 30-39'],
      ['fgmiss_40_49', 'FG missed 40-49'],
      ['fgmiss_50p', 'FG missed 50+'],
      ['xpm', 'PAT made'],
      ['xpmiss', 'PAT missed'],
    ],
  },
  {
    group: 'Defense',
    keys: [
      ['sack', 'Sack'],
      ['int', 'Interception'],
      ['fum_rec', 'Fumble recovery'],
      ['ff', 'Forced fumble'],
      ['def_td', 'Touchdown'],
      ['safe', 'Safety'],
      ['blk_kick', 'Blocked kick'],
      ['pts_allow_0', '0 points allowed'],
      ['pts_allow_1_6', '1-6 points allowed'],
      ['pts_allow_7_13', '7-13 points allowed'],
      ['pts_allow_14_20', '14-20 points allowed'],
      ['pts_allow_21_27', '21-27 points allowed'],
      ['pts_allow_28_34', '28-34 points allowed'],
      ['pts_allow_35p', '35+ points allowed'],
    ],
  },
];

/**
 * Groups a scoring map for display. Keys outside the known groups land in
 * "Other" under their raw Sleeper key.
 */
export function groupScoringForDisplay(
  settings: Record<string, number>
): { group: string; rows: { key: string; label: string; value: number }[] }[] {
  const seen = new Set<string>();
  const groups = SCORING_DISPLAY_GROUPS.map(({ group, keys }) => ({
    group,
    rows: keys
      .filter(([key]) => settings[key] !== undefined && settings[key] !== 0)
      .map(([key, label]) => {
        seen.add(key);
        return { key, label, value: settings[key] };
      }),
  }));
  const other = Object.entries(settings)
    .filter(([key, value]) => !seen.has(key) && value !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, label: key, value }));
  if (other.length > 0) groups.push({ group: 'Other', rows: other });
  return groups.filter((g) => g.rows.length > 0);
}

/** "half PPR", "PPR", "standard", or "0.75 PPR", for a one-line summary. */
export function describeReceptionScoring(settings: Record<string, number>): string {
  const rec = settings.rec ?? 0;
  if (rec === 0) return 'standard (no PPR)';
  if (rec === 0.5) return 'half PPR';
  if (rec === 1) return 'PPR';
  return `${rec} PPR`;
}

/** The providers whose scoring this module reads or infers (Sleeper gives it directly). */
export const SCORING_RESOLVED_PROVIDERS: FantasyProvider[] = ['yahoo', 'espn', 'ottoneu'];
