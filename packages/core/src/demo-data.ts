import type { Player, Team } from './types';

/**
 * Deterministic, time-driven fake data for "demo mode" — a way to
 * exercise the live-scoreboard UI (web + mobile) outside the NFL season
 * and outside game windows.
 *
 * The generator is a pure function of the current time: given the same
 * `nowMs` it always returns the same board. Roster composition, team
 * names, opponents and player identities are fixed; only the things that
 * move during a real Sunday — scores, game clocks, quarters, and
 * game-state transitions (pregame -> in_progress -> final) — change as
 * time advances. That's exactly what a poll every ~30s needs to light up
 * the score-change animations and clock displays.
 *
 * All of this is platform-neutral (no React/Next/Node/browser globals),
 * so it lives in `@roster-loom/core` and is shared by both apps.
 */

/**
 * Length of one simulated Sunday slate. The full pregame -> final arc for
 * every game is compressed into this window and then loops, so a tester
 * sees games kick off, run, and finalize within a short session. Fifteen
 * minutes keeps a good mix of live / final / pregame games on screen at
 * any given moment.
 */
export const DEMO_SLATE_CYCLE_MS = 15 * 60 * 1000;

/** Options for {@link generateDemoTeams}. */
export interface GenerateDemoTeamsOptions {
  /** How many of the user's teams (matchups) to generate. Default 10. */
  teamCount?: number;
  /**
   * Length of the simulated slate in milliseconds. Defaults to
   * {@link DEMO_SLATE_CYCLE_MS}. Lower values make games move faster.
   */
  cycleMs?: number;
}

const DEFAULT_TEAM_COUNT = 10;

type Position = 'QB' | 'RB' | 'WR' | 'TE';

interface PoolPlayer {
  name: string;
  position: Position;
  /** Real-life NFL team abbreviation (ESPN/Sleeper style). */
  team: string;
  /**
   * Sleeper player id, when known — used to load a real headshot. When
   * absent, a stable initials avatar is used instead. Fill these in to
   * get real player photos in the demo.
   */
  sleeperId?: string;
}

interface DemoGame {
  home: string;
  away: string;
  /** Fraction of the cycle at which this game kicks off, in [0, 1]. */
  start: number;
  /** Fraction of the cycle at which this game goes final, in [0, 1]. */
  end: number;
}

/**
 * A simulated Sunday slate. Early games (1pm ET) kick first and finish
 * mid-cycle; late games (4pm ET) overlap and finish near the end; the
 * night game stays pregame for most of the cycle and kicks late. The
 * spread guarantees a live/final/pregame mix at almost any moment.
 */
const GAMES: DemoGame[] = [
  { home: 'KC', away: 'BUF', start: 0.04, end: 0.54 },
  { home: 'SF', away: 'DAL', start: 0.05, end: 0.55 },
  { home: 'MIN', away: 'GB', start: 0.07, end: 0.57 },
  { home: 'CIN', away: 'BAL', start: 0.09, end: 0.59 },
  { home: 'MIA', away: 'NYJ', start: 0.11, end: 0.61 },
  { home: 'DET', away: 'CHI', start: 0.4, end: 0.9 },
  { home: 'PHI', away: 'ATL', start: 0.42, end: 0.92 },
  { home: 'HOU', away: 'LAR', start: 0.45, end: 0.95 },
  { home: 'LV', away: 'DEN', start: 0.82, end: 1.0 },
];

const TEAM_TO_GAME = new Map<string, DemoGame>();
for (const game of GAMES) {
  TEAM_TO_GAME.set(game.home, game);
  TEAM_TO_GAME.set(game.away, game);
}

/**
 * The pool of players demo rosters are drawn from. Real names, positions,
 * and NFL teams so the board reads like a real Sunday; players are reused
 * across fantasy teams so share counts and the matchup report populate.
 */
const PLAYER_POOL: PoolPlayer[] = [
  // QBs
  { name: 'Patrick Mahomes', position: 'QB', team: 'KC' },
  { name: 'Josh Allen', position: 'QB', team: 'BUF' },
  { name: 'Brock Purdy', position: 'QB', team: 'SF' },
  { name: 'Dak Prescott', position: 'QB', team: 'DAL' },
  { name: 'Jalen Hurts', position: 'QB', team: 'PHI' },
  { name: 'Joe Burrow', position: 'QB', team: 'CIN' },
  { name: 'Lamar Jackson', position: 'QB', team: 'BAL' },
  { name: 'Jared Goff', position: 'QB', team: 'DET' },
  { name: 'Tua Tagovailoa', position: 'QB', team: 'MIA' },
  { name: 'C.J. Stroud', position: 'QB', team: 'HOU' },
  // RBs
  { name: 'Christian McCaffrey', position: 'RB', team: 'SF' },
  { name: 'Saquon Barkley', position: 'RB', team: 'PHI' },
  { name: 'Derrick Henry', position: 'RB', team: 'BAL' },
  { name: 'Bijan Robinson', position: 'RB', team: 'ATL' },
  { name: 'Jahmyr Gibbs', position: 'RB', team: 'DET' },
  { name: 'Isiah Pacheco', position: 'RB', team: 'KC' },
  { name: 'James Cook', position: 'RB', team: 'BUF' },
  { name: 'Kyren Williams', position: 'RB', team: 'LAR' },
  { name: 'Josh Jacobs', position: 'RB', team: 'GB' },
  { name: 'Joe Mixon', position: 'RB', team: 'HOU' },
  { name: "De'Von Achane", position: 'RB', team: 'MIA' },
  { name: 'Chase Brown', position: 'RB', team: 'CIN' },
  // WRs
  { name: 'Tyreek Hill', position: 'WR', team: 'MIA' },
  { name: 'Ja’Marr Chase', position: 'WR', team: 'CIN' },
  { name: 'CeeDee Lamb', position: 'WR', team: 'DAL' },
  { name: 'Amon-Ra St. Brown', position: 'WR', team: 'DET' },
  { name: 'A.J. Brown', position: 'WR', team: 'PHI' },
  { name: 'Deebo Samuel', position: 'WR', team: 'SF' },
  { name: 'Puka Nacua', position: 'WR', team: 'LAR' },
  { name: 'Nico Collins', position: 'WR', team: 'HOU' },
  { name: 'Zay Flowers', position: 'WR', team: 'BAL' },
  { name: 'Garrett Wilson', position: 'WR', team: 'NYJ' },
  { name: 'Jaylen Waddle', position: 'WR', team: 'MIA' },
  { name: 'Rashee Rice', position: 'WR', team: 'KC' },
  { name: 'Jayden Reed', position: 'WR', team: 'GB' },
  { name: 'DJ Moore', position: 'WR', team: 'CHI' },
  { name: 'Courtland Sutton', position: 'WR', team: 'DEN' },
  { name: 'Jakobi Meyers', position: 'WR', team: 'LV' },
  // TEs
  { name: 'Travis Kelce', position: 'TE', team: 'KC' },
  { name: 'George Kittle', position: 'TE', team: 'SF' },
  { name: 'Sam LaPorta', position: 'TE', team: 'DET' },
  { name: 'Mark Andrews', position: 'TE', team: 'BAL' },
  { name: 'Trey McBride', position: 'TE', team: 'CIN' },
  { name: 'Dallas Goedert', position: 'TE', team: 'PHI' },
];

const POOL_BY_POSITION: Record<Position, PoolPlayer[]> = {
  QB: PLAYER_POOL.filter((p) => p.position === 'QB'),
  RB: PLAYER_POOL.filter((p) => p.position === 'RB'),
  WR: PLAYER_POOL.filter((p) => p.position === 'WR'),
  TE: PLAYER_POOL.filter((p) => p.position === 'TE'),
};

const TEAM_NAMES = [
  'Gridiron Gladiators',
  'Endzone Enforcers',
  'Blitz Brigade',
  'Hail Mary Heroes',
  'Pocket Protectors',
  'Red Zone Rebels',
  'Fourth & Long',
  'Sunday Scaries',
  'Audible Assassins',
  'Play Action Pythons',
  'Two Minute Warning',
  'Pylon Pirates',
];

const OPPONENT_NAMES = [
  'The Touchdown Kings',
  'Pigskin Prophets',
  'Neutral Zone Ninjas',
  'Cover Two Crusaders',
  'Shotgun Savages',
  'Screen Pass Scholars',
  'Onside Outlaws',
  'Zone Read Zealots',
  'Flea Flicker Fanatics',
  'Goal Line Grizzlies',
  'Draft Day Demons',
  'Waiver Wire Warriors',
];

/**
 * Projected full-game fantasy points by position. A player's live score
 * ramps from 0 toward roughly this value (with deterministic per-player
 * variance) as their game progresses.
 */
const POSITION_PROJECTION: Record<Position, number> = {
  QB: 22,
  RB: 16,
  WR: 15,
  TE: 11,
};

// --- deterministic hashing / pseudo-randomness -------------------------

/** xmur3 string hash — seeds the PRNG from a stable string. */
function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/**
 * Returns a deterministic pseudo-random number in [0, 1) for a given
 * seed string and integer step. Same inputs always yield the same value,
 * so the board is stable across polls while still looking uneven.
 */
function seededUnit(seed: string, step: number): number {
  const h = hashString(`${seed}#${step}`);
  return h / 4294967296;
}

// --- game state --------------------------------------------------------

interface GameState {
  status: 'pregame' | 'in_progress' | 'final';
  /** How far through the game we are, in [0, 1]. */
  fraction: number;
  gameQuarter: string | null;
  gameClock: string | null;
  gameStartTime: string | null;
}

function formatClock(secondsRemaining: number): string {
  const clamped = Math.max(0, Math.round(secondsRemaining));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function resolveGameState(
  game: DemoGame,
  cycleProgress: number,
  cycleStartMs: number,
  cycleMs: number,
): GameState {
  if (cycleProgress < game.start) {
    const kickoffMs = cycleStartMs + game.start * cycleMs;
    return {
      status: 'pregame',
      fraction: 0,
      gameQuarter: null,
      gameClock: null,
      gameStartTime: new Date(kickoffMs).toISOString(),
    };
  }

  if (cycleProgress >= game.end) {
    return {
      status: 'final',
      fraction: 1,
      gameQuarter: 'Final',
      gameClock: null,
      gameStartTime: null,
    };
  }

  const fraction = (cycleProgress - game.start) / (game.end - game.start);
  const quarterFloat = Math.min(3.999, fraction * 4);
  const quarter = Math.floor(quarterFloat) + 1;
  const fractionThroughQuarter = quarterFloat - Math.floor(quarterFloat);
  const secondsRemaining = (1 - fractionThroughQuarter) * 15 * 60;

  return {
    status: 'in_progress',
    fraction,
    gameQuarter: `Q${quarter}`,
    gameClock: formatClock(secondsRemaining),
    gameStartTime: null,
  };
}

/**
 * Monotonic, uneven scoring curve. Splits the game into segments with
 * deterministic per-player weights so a player scores in bursts (a big
 * quarter here, a quiet one there) but never loses points — matching how
 * a live fantasy score only ever climbs.
 */
function scoreForFraction(seed: string, projection: number, fraction: number): number {
  if (fraction <= 0) return 0;

  const segments = 8;
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < segments; i += 1) {
    // 0.4..1.4 range keeps every segment positive (monotonic) but varied.
    const w = 0.4 + seededUnit(seed, i + 1);
    weights.push(w);
    total += w;
  }

  const scaled = fraction * segments;
  const fullSegments = Math.floor(scaled);
  const partial = scaled - fullSegments;

  let cumulative = 0;
  for (let i = 0; i < fullSegments && i < segments; i += 1) {
    cumulative += weights[i];
  }
  if (fullSegments < segments) {
    cumulative += weights[fullSegments] * partial;
  }

  const progress = cumulative / total;
  // Per-player projection variance: +/-25%, stable across polls.
  const variance = 0.75 + seededUnit(seed, 0) * 0.5;
  const score = projection * variance * progress;
  return Math.round(score * 10) / 10;
}

function headshotUrl(pool: PoolPlayer): string {
  if (pool.sleeperId) {
    return `https://sleepercdn.com/content/nfl/players/thumb/${pool.sleeperId}.jpg`;
  }
  const initials = pool.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const bg = (hashString(pool.name) % 0xffffff).toString(16).padStart(6, '0');
  return `https://placehold.co/80x80/${bg}/ffffff?text=${encodeURIComponent(initials)}`;
}

// --- roster construction ----------------------------------------------

/** Starter template: which positions a roster starts, in display order. */
const STARTER_SLOTS: Position[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE'];
/** FLEX + bench are filled from this rotating skill-position order. */
const FLEX_ORDER: Position[] = ['RB', 'WR', 'TE'];

/**
 * Deterministically picks players for one roster. `offset` shifts which
 * players a given team draws so different teams overlap (shared stars)
 * without repeating a player within a single roster.
 */
function buildRoster(offset: number): PoolPlayer[] {
  const picked: PoolPlayer[] = [];
  const used = new Set<string>();

  const takeFrom = (position: Position, cursor: number): PoolPlayer => {
    const bucket = POOL_BY_POSITION[position];
    for (let i = 0; i < bucket.length; i += 1) {
      const candidate = bucket[(cursor + i) % bucket.length];
      const key = `${candidate.name}-${candidate.team}`;
      if (!used.has(key)) {
        used.add(key);
        return candidate;
      }
    }
    // Fallback (bucket exhausted): allow reuse.
    return bucket[cursor % bucket.length];
  };

  STARTER_SLOTS.forEach((position, index) => {
    picked.push(takeFrom(position, offset + index * 3));
  });

  // One FLEX starter + three bench players.
  for (let i = 0; i < 4; i += 1) {
    const position = FLEX_ORDER[(offset + i) % FLEX_ORDER.length];
    picked.push(takeFrom(position, offset + 5 + i * 2));
  }

  return picked;
}

function toPlayer(
  pool: PoolPlayer,
  rosterIndex: number,
  cycleProgress: number,
  cycleStartMs: number,
  cycleMs: number,
): Player {
  const game = TEAM_TO_GAME.get(pool.team);
  const state: GameState = game
    ? resolveGameState(game, cycleProgress, cycleStartMs, cycleMs)
    : {
        status: 'pregame',
        fraction: 0,
        gameQuarter: null,
        gameClock: null,
        gameStartTime: null,
      };

  const seed = `${pool.name}-${pool.team}`;
  const projection = POSITION_PROJECTION[pool.position];
  const score = scoreForFraction(seed, projection, state.fraction);
  const onBench = rosterIndex >= STARTER_SLOTS.length + 1; // last 3 are bench

  return {
    id: `${seed}`,
    name: pool.name,
    position: pool.position,
    realTeam: pool.team,
    score,
    gameStatus: state.status,
    gameStartTime: state.gameStartTime,
    gameQuarter: state.gameQuarter,
    gameClock: state.gameClock,
    onUserTeams: 0,
    onOpponentTeams: 0,
    gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
    imageUrl: headshotUrl(pool),
    onBench,
  };
}

function sumStarters(players: Player[]): number {
  const total = players
    .filter((player) => !player.onBench)
    .reduce((acc, player) => acc + player.score, 0);
  return Math.round(total * 10) / 10;
}

/**
 * Annotates every player with how many of the user's teams and opponent
 * teams they appear on, so the "on N teams" badges render realistically.
 */
function annotateShareCounts(teams: Team[]): void {
  const userCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();

  const keyOf = (player: Player) => `${player.name.toLowerCase()}-${player.realTeam.toLowerCase()}`;

  for (const team of teams) {
    for (const player of team.players) {
      userCounts.set(keyOf(player), (userCounts.get(keyOf(player)) ?? 0) + 1);
    }
    for (const player of team.opponent.players) {
      opponentCounts.set(keyOf(player), (opponentCounts.get(keyOf(player)) ?? 0) + 1);
    }
  }

  for (const team of teams) {
    for (const player of team.players) {
      player.onUserTeams = userCounts.get(keyOf(player)) ?? 0;
      player.onOpponentTeams = opponentCounts.get(keyOf(player)) ?? 0;
    }
    for (const player of team.opponent.players) {
      player.onUserTeams = userCounts.get(keyOf(player)) ?? 0;
      player.onOpponentTeams = opponentCounts.get(keyOf(player)) ?? 0;
    }
  }
}

/**
 * Generates a full slate of demo teams for the given moment in time.
 *
 * Deterministic in `nowMs`: identical times produce identical boards, so
 * two polls a few seconds apart differ only in the things that move
 * during live games (scores, clocks, game state).
 *
 * @param nowMs - The current time in epoch milliseconds (e.g. `Date.now()`).
 * @param options - Team count and cycle length overrides.
 * @returns The user's teams, each with an opponent and full rosters.
 */
export function generateDemoTeams(
  nowMs: number,
  options: GenerateDemoTeamsOptions = {},
): Team[] {
  const teamCount = options.teamCount ?? DEFAULT_TEAM_COUNT;
  const cycleMs = options.cycleMs ?? DEMO_SLATE_CYCLE_MS;

  const cycleStartMs = Math.floor(nowMs / cycleMs) * cycleMs;
  const cycleProgress = (nowMs - cycleStartMs) / cycleMs;

  const teams: Team[] = [];

  for (let t = 0; t < teamCount; t += 1) {
    const userRoster = buildRoster(t * 2);
    const opponentRoster = buildRoster(t * 2 + teamCount + 1);

    const userPlayers = userRoster.map((pool, index) =>
      toPlayer(pool, index, cycleProgress, cycleStartMs, cycleMs),
    );
    const opponentPlayers = opponentRoster.map((pool, index) =>
      toPlayer(pool, index, cycleProgress, cycleStartMs, cycleMs),
    );

    teams.push({
      id: t + 1,
      name: TEAM_NAMES[t % TEAM_NAMES.length],
      league: {
        provider: 'demo',
        providerLeagueId: `demo-league-${t + 1}`,
        name: `${TEAM_NAMES[t % TEAM_NAMES.length]} League`,
        season: String(new Date(nowMs).getFullYear()),
        totalRosters: 12,
      },
      totalScore: sumStarters(userPlayers),
      players: userPlayers,
      opponent: {
        name: OPPONENT_NAMES[t % OPPONENT_NAMES.length],
        totalScore: sumStarters(opponentPlayers),
        players: opponentPlayers,
      },
    });
  }

  annotateShareCounts(teams);

  return teams;
}
