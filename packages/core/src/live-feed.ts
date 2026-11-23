/**
 * The shared live NFL feed: play-by-play scoring, projections and win
 * probability for any league, from the plays ottoneu-db already scrapes.
 *
 * ottoneu-db's live loop (`scripts/live_score_worm.py`, a timer on its
 * droplet) reads ESPN's play-by-play every minute while games are on, and
 * nflverse's once a game is published. Besides its own league's score
 * worm, it publishes the plays themselves, league-agnostic, to three tables
 * on the database the two apps share (ottoneu-db migration 066):
 *
 * - `nfl_live_games`   — each NFL game's state and game clock
 * - `nfl_live_plays`   — each play's time, game seconds elapsed and every
 *                        player's stat line on it, keyed by gsis id, in
 *                        Sleeper's stat keys
 * - `nfl_live_players` — gsis id → ESPN id, name, position, team
 *
 * plus a heartbeat in `live_worm_state`. Everything here is pure: the web
 * app loads a {@link LiveFeed} and lays it over the teams the providers
 * returned ({@link applyLiveFeed}).
 *
 * **The model is ottoneu-db's live worm, unchanged** (see its
 * `scripts/rebuild_score_worm.py` and `web/lib/worm-cone.ts`):
 *
 * - A starter's expected final is his points so far plus his kickoff
 *   projection × the share of his NFL game still to play, read from the
 *   feed's game clock rather than parsed from a display string.
 * - The uncertainty left in a lineup is `WORM_LINEUP_SD` (20.3 points, the
 *   fitted spread of an 8-starter lineup's total around its projection)
 *   scaled by the square root of the share of its minutes still to play.
 *   Spread per starter ({@link WORM_STARTER_VARIANCE}) so lineups of any
 *   size get the same per-player uncertainty; an 8-starter lineup gets
 *   exactly ottoneu-db's number.
 * - The win probability is the normal chance the expected margin survives
 *   both sides' uncertainty.
 * - The headline score is the feed's play-by-play total while the loop is
 *   running and the matchup unsettled, with the provider's (official) score
 *   kept beside it; the provider's alone otherwise. This needs the league's
 *   real scoring, so it applies only where we have it (Sleeper). Elsewhere
 *   the provider's score stays the headline and the feed supplies the game
 *   clock, the worm (stock-scored) and the win probability.
 */

import { CONE_Z, WORM_STARTER_VARIANCE, normalCdf } from './worm-model';
import { scoreStatLine, type SleeperStockScoringMode } from './sleeper';
import type { LeagueRef, Player, SleeperPlayer, Team, TeamLiveState, WormPoint } from './types';

/** The loop writes a heartbeat every 60 seconds; three missed passes means it has stopped. */
export const LIVE_HEARTBEAT_MS = 3 * 60 * 1000;

/** How often an open page refreshes while the feed is live: twice per loop pass. */
export const LIVE_REFRESH_MS = 30 * 1000;

const REGULATION_SECONDS = 3600;
const EPSILON = 0.005;

// --- Feed shapes -------------------------------------------------------------

/** One NFL game, as `nfl_live_games` holds it. */
export type LiveFeedGame = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: string | null;
  state: 'pre' | 'in' | 'post';
  elapsedSeconds: number;
  lengthSeconds: number;
  finished: boolean;
  lastPlayAt: string | null;
};

/** A player's stat line on one play, Sleeper stat key -> value. */
export type LiveStatLine = Record<string, number>;

/** One play, as `nfl_live_plays` holds it. */
export type LiveFeedPlay = {
  gameId: string;
  playId: number;
  playAt: string;
  elapsedSeconds: number | null;
  stats: Record<string, LiveStatLine> | null;
};

/** One `nfl_live_players` row. */
export type LiveFeedPlayer = {
  gsisId: string;
  espnId: string | null;
  fullName: string;
  position: string | null;
  team: string | null;
};

/** The live week's feed, as loaded from the shared database. */
export type LiveFeed = {
  season: number;
  week: number;
  /** The loop's last heartbeat (ISO), or null once it has exited. */
  heartbeatAt: string | null;
  games: LiveFeedGame[];
  plays: LiveFeedPlay[];
  players: LiveFeedPlayer[];
};

/**
 * Whether the loop's heartbeat is fresh, so the feed is still moving.
 *
 * @param heartbeatAt - The heartbeat timestamp (ISO), if any.
 * @param now - The current time in ms.
 */
export function isHeartbeatFresh(heartbeatAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!heartbeatAt) return false;
  const at = Date.parse(heartbeatAt);
  return Number.isFinite(at) && now - at <= LIVE_HEARTBEAT_MS;
}

// --- Teams and clocks ---------------------------------------------------------

/** Provider team codes that nflverse spells differently. */
const NFLVERSE_TEAM: Record<string, string> = {
  LAR: 'LA',
  WSH: 'WAS',
  JAC: 'JAX',
  LVR: 'LV',
  OAK: 'LV',
  SD: 'LAC',
  STL: 'LA',
};

/** A provider's NFL team code in nflverse's spelling (the feed's). */
export function nflverseTeam(code: string | null | undefined): string {
  const upper = (code ?? '').trim().toUpperCase();
  return NFLVERSE_TEAM[upper] ?? upper;
}

/**
 * The share of an NFL game still to be played, in [0, 1], from its clock.
 * Not started: all of it. Finished: none. A game's length is 60 minutes
 * until it runs into overtime.
 */
export function gameRemainingShare(game: Pick<LiveFeedGame, 'state' | 'finished' | 'elapsedSeconds' | 'lengthSeconds'>): number {
  if (game.finished || game.state === 'post') return 0;
  if (game.state === 'pre') return 1;
  const length = Math.max(game.lengthSeconds || REGULATION_SECONDS, REGULATION_SECONDS, game.elapsedSeconds);
  return Math.min(1, Math.max(0, 1 - game.elapsedSeconds / length));
}

// --- Scoring --------------------------------------------------------------------

/**
 * Stock scoring profiles in Sleeper's stat keys, for leagues whose real
 * settings this app can't read (Yahoo, ESPN, Ottoneu). The same profiles
 * `scoreStockProjection` reads off Sleeper's projections.
 */
const STOCK_BASE: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -2,
  pass_2pt: 2,
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

export const STOCK_SCORING_SETTINGS: Record<SleeperStockScoringMode, Record<string, number>> = {
  std: { ...STOCK_BASE },
  half_ppr: { ...STOCK_BASE, rec: 0.5 },
  ppr: { ...STOCK_BASE, rec: 1 },
};

/**
 * Which scoring to apply to a league's live plays: its own settings when
 * the provider gave them to us, a stock profile otherwise.
 */
export function liveScoringFor(
  league: LeagueRef | undefined,
  stockMode: SleeperStockScoringMode = 'half_ppr'
): { settings: Record<string, number>; scoring: 'exact' | 'stock' } {
  const own = league?.scoringSettings;
  if (own && Object.keys(own).length > 0) {
    return { settings: own, scoring: 'exact' };
  }
  return { settings: STOCK_SCORING_SETTINGS[stockMode], scoring: 'stock' };
}

/** Sleeper's yardage-milestone bonus keys: [key, stat, threshold]. */
const YARDAGE_BONUSES: [string, string[], number][] = [
  ['bonus_pass_yd_300', ['pass_yd'], 300],
  ['bonus_pass_yd_400', ['pass_yd'], 400],
  ['bonus_rush_yd_100', ['rush_yd'], 100],
  ['bonus_rush_yd_200', ['rush_yd'], 200],
  ['bonus_rec_yd_100', ['rec_yd'], 100],
  ['bonus_rec_yd_200', ['rec_yd'], 200],
  ['bonus_rush_rec_yd_100', ['rush_yd', 'rec_yd'], 100],
  ['bonus_rush_rec_yd_200', ['rush_yd', 'rec_yd'], 200],
];

/**
 * A cumulative stat line plus the stats Sleeper scores that are derived
 * from totals rather than counted per play: yardage milestones and the
 * tight-end reception premium.
 */
export function withDerivedStats(stats: LiveStatLine, position: string | null | undefined): LiveStatLine {
  const out: LiveStatLine = { ...stats };
  for (const [key, sources, threshold] of YARDAGE_BONUSES) {
    const total = sources.reduce((sum, stat) => sum + (stats[stat] ?? 0), 0);
    if (total >= threshold) out[key] = 1;
  }
  if ((position ?? '').toUpperCase() === 'TE' && stats.rec) {
    out.bonus_rec_te = stats.rec;
  }
  return out;
}

/**
 * Points for a player's cumulative live stat line under a scoring map.
 *
 * @param stats - The player's stats so far.
 * @param settings - Sleeper-keyed scoring settings.
 * @param position - The player's position, for position-specific bonuses.
 */
export function scoreLiveStats(
  stats: LiveStatLine | undefined,
  settings: Record<string, number>,
  position?: string | null
): number {
  return scoreStatLine(withDerivedStats(stats ?? {}, position), settings) ?? 0;
}

/** Adds one stat line into another, in place. */
function addLine(into: LiveStatLine, line: LiveStatLine): void {
  for (const [key, value] of Object.entries(line)) {
    if (typeof value === 'number') into[key] = (into[key] ?? 0) + value;
  }
}

/** Every player's stats so far: gsis id -> cumulative stat line. */
export function playerStatTotals(plays: LiveFeedPlay[]): Map<string, LiveStatLine> {
  const totals = new Map<string, LiveStatLine>();
  for (const play of plays) {
    if (!play.stats) continue;
    for (const [gsis, line] of Object.entries(play.stats)) {
      const total = totals.get(gsis) ?? {};
      addLine(total, line);
      totals.set(gsis, total);
    }
  }
  return totals;
}

// --- Matching players to the feed -------------------------------------------

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** "Marvin Harrison Jr." -> "marvin harrison"; "D'Andre Swift" -> "dandre swift". */
export function normalizeFeedName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.'’`]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter((part) => part && !NAME_SUFFIXES.has(part))
    .join(' ');
}

const isDefense = (position: string | undefined): boolean => {
  const letters = (position ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return letters.startsWith('DEF') || letters === 'DST' || letters === 'DS';
};

/** Resolves a roster player to the feed's gsis id, or null. */
export type LiveIdResolver = (player: Player, provider: string | undefined) => string | null;

/**
 * Builds the player → gsis id matcher for one feed.
 *
 * Sleeper players carry ids straight from Sleeper's pool (gsis, else ESPN
 * via `nfl_live_players`). Everyone else — and any Sleeper player the pool
 * has no id for — is matched by normalized name, with NFL team and then
 * position breaking ties, as ottoneu-db matches its own lineups. Defenses
 * never match: the feed doesn't score them.
 *
 * @param players - The feed's `nfl_live_players` rows.
 * @param sleeperPool - Sleeper's player pool, keyed by Sleeper id.
 */
export function createLiveIdResolver(
  players: LiveFeedPlayer[],
  sleeperPool?: Record<string, SleeperPlayer>
): LiveIdResolver {
  const known = new Set(players.map((p) => p.gsisId));
  const byEspn = new Map<string, string>();
  const byName = new Map<string, LiveFeedPlayer[]>();
  for (const player of players) {
    if (player.espnId) byEspn.set(String(player.espnId), player.gsisId);
    const key = normalizeFeedName(player.fullName);
    const list = byName.get(key) ?? [];
    list.push(player);
    byName.set(key, list);
  }
  const cache = new Map<string, string | null>();

  return (player, provider) => {
    if (isDefense(player.position)) return null;

    if (provider === 'sleeper' && sleeperPool) {
      const pooled = sleeperPool[player.id];
      if (pooled?.gsis_id && known.has(String(pooled.gsis_id).trim())) {
        return String(pooled.gsis_id).trim();
      }
      if (pooled?.espn_id != null) {
        const viaEspn = byEspn.get(String(pooled.espn_id));
        if (viaEspn) return viaEspn;
      }
    }

    const cacheKey = `${player.name}|${player.realTeam}|${player.position}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

    let candidates = byName.get(normalizeFeedName(player.name)) ?? [];
    const team = nflverseTeam(player.realTeam);
    const position = (player.position ?? '').toUpperCase();
    const narrow = (keep: (c: LiveFeedPlayer) => boolean) => {
      if (candidates.length <= 1) return;
      const narrowed = candidates.filter(keep);
      if (narrowed.length > 0) candidates = narrowed;
    };
    narrow((c) => nflverseTeam(c.team) === team);
    narrow((c) => (c.position ?? '').toUpperCase() === position);
    const match = candidates.length === 1 ? candidates[0].gsisId : null;
    cache.set(cacheKey, match);
    return match;
  };
}

// --- The worm ---------------------------------------------------------------------

/** One starter, as the worm needs him. */
export type WormStarter = {
  side: 'team' | 'opponent';
  gsisId: string | null;
  /** The NFL game his minutes come from; null on a bye or unknown. */
  gameId: string | null;
  /** His kickoff projection, in his league's scoring (0 if none). */
  projection: number;
  name: string;
  position: string | null;
};

/** "Ja'Marr Chase" -> "J. Chase". */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0][0]}. ${parts.slice(1).join(' ')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The win probability once `variance` points² of uncertainty remain; with
 * none left it is settled: 1, 0, or ½ for a tie.
 */
export function wormWinProbability(margin: number, variance: number): number {
  if (variance <= 1e-9) {
    return margin >= EPSILON ? 1 : margin <= -EPSILON ? 0 : 0.5;
  }
  return normalCdf(margin / Math.sqrt(variance));
}

/**
 * Draws a matchup's score worm from the feed's plays (pure): one point per
 * play that moved either side's total, each carrying both sides' share of
 * lineup minutes played, projected points still to come, and the win
 * probability at that moment — ottoneu-db's `build_game_plays`, for any
 * league. A "Kickoff" point at 0–0 before the first score holds the pre-game
 * odds.
 *
 * @param starters - Both sides' starters.
 * @param plays - The feed's plays (any order).
 * @param games - The feed's games, by id.
 * @param settings - The league's (or a stock) scoring settings.
 */
export function buildMatchupWorm(
  starters: WormStarter[],
  plays: LiveFeedPlay[],
  games: Map<string, LiveFeedGame>,
  settings: Record<string, number>
): WormPoint[] {
  const owners = new Map<string, WormStarter>();
  for (const starter of starters) {
    if (starter.gsisId) owners.set(starter.gsisId, starter);
  }
  const used = new Set(starters.map((s) => s.gameId).filter((g): g is string => Boolean(g)));
  const ordered = plays
    .filter((p) => used.has(p.gameId))
    .sort((a, b) => a.playAt.localeCompare(b.playAt) || a.gameId.localeCompare(b.gameId) || a.playId - b.playId);

  const lastIndex = new Map<string, number>();
  ordered.forEach((play, index) => lastIndex.set(play.gameId, index));

  const elapsed = new Map<string, number>();
  const length = (gameId: string) => {
    const game = games.get(gameId);
    return Math.max(game?.lengthSeconds ?? REGULATION_SECONDS, REGULATION_SECONDS);
  };
  const share = (gameId: string) => Math.min(1, (elapsed.get(gameId) ?? 0) / length(gameId));

  const cumulative = new Map<string, LiveStatLine>();
  const points = new Map<string, number>();
  const totals = { team: 0, opponent: 0 };
  const worm: WormPoint[] = [];

  const sideState = (side: WormStarter['side']) => {
    let remaining = 0;
    let played = 0;
    let total = 0;
    let variance = 0;
    for (const starter of starters) {
      if (starter.side !== side || !starter.gameId) continue;
      const left = 1 - share(starter.gameId);
      remaining += starter.projection * left;
      played += elapsed.get(starter.gameId) ?? 0;
      total += length(starter.gameId);
      variance += WORM_STARTER_VARIANCE * left;
    }
    return { remaining, progress: total > 0 ? Math.min(1, played / total) : 1, variance };
  };

  const emit = (at: string, note: string) => {
    const team = sideState('team');
    const opponent = sideState('opponent');
    const margin = totals.team + team.remaining - (totals.opponent + opponent.remaining);
    worm.push({
      at,
      team: round2(totals.team),
      opponent: round2(totals.opponent),
      note,
      teamProgress: Math.round(team.progress * 10000) / 10000,
      opponentProgress: Math.round(opponent.progress * 10000) / 10000,
      teamRemaining: round2(team.remaining),
      opponentRemaining: round2(opponent.remaining),
      winProbability: Math.round(wormWinProbability(margin, team.variance + opponent.variance) * 10000) / 10000,
    });
  };

  ordered.forEach((play, index) => {
    if (play.elapsedSeconds != null) {
      elapsed.set(play.gameId, Math.max(elapsed.get(play.gameId) ?? 0, play.elapsedSeconds));
    }
    if (lastIndex.get(play.gameId) === index && games.get(play.gameId)?.finished) {
      elapsed.set(play.gameId, length(play.gameId));
    }
    if (!play.stats) return;

    const credited: [WormStarter, number][] = [];
    for (const [gsis, line] of Object.entries(play.stats)) {
      const owner = owners.get(gsis);
      if (!owner) continue;
      const total = cumulative.get(gsis) ?? {};
      addLine(total, line);
      cumulative.set(gsis, total);
      const now = scoreLiveStats(total, settings, owner.position);
      const delta = now - (points.get(gsis) ?? 0);
      points.set(gsis, now);
      if (Math.abs(delta) >= EPSILON) credited.push([owner, delta]);
    }
    if (credited.length === 0) return;

    if (worm.length === 0) {
      // The pre-game odds, at 0–0, before any clock has moved.
      const saved = new Map(elapsed);
      elapsed.clear();
      emit(ordered[0].playAt, 'Kickoff');
      saved.forEach((value, key) => elapsed.set(key, value));
    }
    for (const [owner, delta] of credited) {
      totals[owner.side] += delta;
    }
    emit(play.playAt, credited.map(([o, d]) => `${shortName(o.name)} ${d >= 0 ? '+' : ''}${d.toFixed(2)}`).join(' · '));
  });

  return worm;
}

/**
 * Each side's 80% range for its final score, seen from a worm point: its
 * points plus everything still projected, give or take the uncertainty of
 * the minutes still to play (ottoneu-db's `finalRanges`, per starter).
 */
export function finalRange(
  points: number,
  remaining: number,
  remainingVariance: number
): [number, number] {
  const half = CONE_Z * Math.sqrt(Math.max(0, remainingVariance));
  const centre = points + remaining;
  return [round2(Math.max(0, centre - half)), round2(centre + half)];
}

// --- Laying the feed over a team ----------------------------------------------

/** What every team shares when one feed is laid over a user's teams. */
export type LiveFeedContext = {
  feed: LiveFeed;
  feedLive: boolean;
  gameByTeam: Map<string, LiveFeedGame>;
  gamesById: Map<string, LiveFeedGame>;
  totals: Map<string, LiveStatLine>;
  resolve: LiveIdResolver;
  liveAt: string | null;
  stockMode: SleeperStockScoringMode;
};

/**
 * Indexes a feed once for all of a user's teams.
 *
 * @param feed - The loaded feed.
 * @param resolve - The player matcher (see {@link createLiveIdResolver}).
 * @param options.now - The current time in ms, for the heartbeat check.
 * @param options.stockMode - The stock scoring for leagues without settings.
 */
export function createLiveFeedContext(
  feed: LiveFeed,
  resolve: LiveIdResolver,
  options: { now?: number; stockMode?: SleeperStockScoringMode } = {}
): LiveFeedContext {
  const gameByTeam = new Map<string, LiveFeedGame>();
  const gamesById = new Map<string, LiveFeedGame>();
  let liveAt: string | null = null;
  for (const game of feed.games) {
    gameByTeam.set(game.homeTeam, game);
    gameByTeam.set(game.awayTeam, game);
    gamesById.set(game.gameId, game);
    if (game.lastPlayAt && (!liveAt || game.lastPlayAt > liveAt)) liveAt = game.lastPlayAt;
  }
  return {
    feed,
    feedLive: isHeartbeatFresh(feed.heartbeatAt, options.now),
    gameByTeam,
    gamesById,
    totals: playerStatTotals(feed.plays),
    resolve,
    liveAt,
    stockMode: options.stockMode ?? 'half_ppr',
  };
}

type OverlaidSide = { players: Player[]; starters: WormStarter[]; settled: boolean; liveDelta: number };

function overlaySide(
  players: Player[],
  side: WormStarter['side'],
  context: LiveFeedContext,
  provider: string | undefined,
  settings: Record<string, number>
): OverlaidSide {
  const starters: WormStarter[] = [];
  let liveDelta = 0;
  let settled = true;
  const overlaid = players.map((player) => {
    const game = context.gameByTeam.get(nflverseTeam(player.realTeam));
    if (!game) {
      return player;
    }
    const gsisId = context.resolve(player, provider);
    const remainingShare = gameRemainingShare(game);
    let points: number | null = null;
    if (gsisId) {
      points = round2(scoreLiveStats(context.totals.get(gsisId), settings, player.position));
    }
    if (!player.onBench) {
      if (remainingShare > 0) settled = false;
      starters.push({
        side,
        gsisId,
        gameId: game.gameId,
        projection: player.projectedPoints ?? 0,
        name: player.name,
        position: player.position ?? null,
      });
      if (points !== null) liveDelta += points - (player.score ?? 0);
    }
    return {
      ...player,
      live: { gsisId, remainingShare, points, officialScore: player.score ?? 0 },
    };
  });
  return { players: overlaid, starters, settled, liveDelta };
}

/**
 * Lays the live feed over one team (pure): every player whose NFL game the
 * feed knows gets his game clock and play-by-play points; the matchup gets
 * its worm; and, where the league's scoring is known and the loop is live,
 * the headline scores become the feed's (official ones kept beside them).
 *
 * @param team - A team as its provider built it.
 * @param context - The indexed feed.
 * @returns The team with `live` set on it and its players.
 */
export function applyLiveFeed(team: Team, context: LiveFeedContext): Team {
  if (context.feed.games.length === 0) return team;
  const provider = team.league?.provider;
  const { settings, scoring } = liveScoringFor(team.league, context.stockMode);

  const mine = overlaySide(team.players ?? [], 'team', context, provider, settings);
  const theirs = overlaySide(team.opponent?.players ?? [], 'opponent', context, provider, settings);

  const settled = mine.settled && theirs.settled;
  const headlineFromFeed = context.feedLive && scoring === 'exact' && !settled;
  const official = { team: team.totalScore ?? 0, opponent: team.opponent?.totalScore ?? 0 };

  const headline = (players: Player[]): Player[] =>
    headlineFromFeed
      ? players.map((p) => (p.live && p.live.points !== null ? { ...p, score: p.live.points } : p))
      : players;

  const worm = buildMatchupWorm(
    [...mine.starters, ...theirs.starters],
    context.feed.plays,
    context.gamesById,
    settings
  );

  const live: TeamLiveState = {
    feedLive: context.feedLive,
    scoring,
    headlineFromFeed,
    official,
    liveAt: context.liveAt,
    worm,
  };

  return {
    ...team,
    // The provider's total plus what the feed has seen beyond it: keeps any
    // bonus or correction the provider folded into its total.
    totalScore: headlineFromFeed ? round2(official.team + mine.liveDelta) : team.totalScore,
    players: headline(mine.players),
    opponent: {
      ...team.opponent,
      totalScore: headlineFromFeed ? round2(official.opponent + theirs.liveDelta) : team.opponent?.totalScore,
      players: headline(theirs.players),
    },
    live,
  };
}
