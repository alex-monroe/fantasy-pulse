/**
 * Reads the shared live NFL feed that ottoneu-db's live loop publishes
 * (ottoneu-db migration 066) and lays it over a user's teams.
 *
 * The feed is the same for everybody, so it is loaded once per instance
 * per week and shared for a few seconds across every user's request
 * (`createCoalescingCache`), exactly like the news pool: the only per-user
 * work is the in-memory overlay in `@roster-loom/core`'s `applyLiveFeed`.
 *
 * The tables are not this repo's — they are owned and written by
 * alex-monroe/ottoneu-db. This module only reads them. Any failure (tables
 * not migrated yet, network) reads as "no feed": teams come back exactly as
 * the providers built them.
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  applyLiveFeed,
  createLiveFeedContext,
  createLiveIdResolver,
  type LiveFeed,
  type LiveFeedGame,
  type LiveFeedPlay,
  type LiveFeedPlayer,
  type SleeperPlayer,
  type Team,
} from '@roster-loom/core';

import logger from '@/utils/logger';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { createCoalescingCache, type CoalescingCache } from '@/lib/teams-cache';

/** Matches the loop's 60s pass: two refreshes per pass never miss one. */
const FEED_TTL_MS = 15 * 1000;

/** Supabase caps a select at 1000 rows; a full week is ~3,000 plays. */
const PAGE_SIZE = 1000;

/** Safety stop for paging: far more plays than any NFL week has. */
const MAX_PAGES = 20;

type GameRow = {
  game_id: string;
  home_team: string;
  away_team: string;
  kickoff: string | null;
  state: 'pre' | 'in' | 'post';
  elapsed_seconds: number | null;
  length_seconds: number | null;
  finished: boolean | null;
  last_play_at: string | null;
};

type PlayRow = {
  game_id: string;
  play_id: number;
  play_at: string;
  elapsed_seconds: number | null;
  stats: Record<string, Record<string, number>> | null;
};

type PlayerRow = {
  gsis_id: string;
  espn_id: string | null;
  full_name: string;
  position: string | null;
  team: string | null;
};

export const toFeedGame = (row: GameRow): LiveFeedGame => ({
  gameId: row.game_id,
  homeTeam: row.home_team,
  awayTeam: row.away_team,
  kickoff: row.kickoff,
  state: row.state,
  elapsedSeconds: row.elapsed_seconds ?? 0,
  lengthSeconds: row.length_seconds ?? 3600,
  finished: Boolean(row.finished),
  lastPlayAt: row.last_play_at,
});

export const toFeedPlay = (row: PlayRow): LiveFeedPlay => ({
  gameId: row.game_id,
  playId: Number(row.play_id),
  playAt: row.play_at,
  elapsedSeconds: row.elapsed_seconds,
  stats: row.stats,
});

export const toFeedPlayer = (row: PlayerRow): LiveFeedPlayer => ({
  gsisId: row.gsis_id,
  espnId: row.espn_id,
  fullName: row.full_name,
  position: row.position,
  team: row.team,
});

/**
 * A read-only client for the shared tables. They are public-read, so the
 * anon key is enough; the service key is preferred when configured only
 * because it is what the other instance-level reads here use.
 */
function feedClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) {
    throw new Error('Supabase is not configured');
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Loads one week's feed straight from the database (uncached).
 *
 * @param client - A Supabase client.
 * @param season - The NFL season.
 * @param week - The NFL week.
 * @returns The feed, or null when the week has no games in it yet.
 */
export async function fetchLiveFeed(
  client: SupabaseClient,
  season: number,
  week: number
): Promise<LiveFeed | null> {
  const [gamesRes, stateRes, playersRes] = await Promise.all([
    client
      .from('nfl_live_games')
      .select('game_id,home_team,away_team,kickoff,state,elapsed_seconds,length_seconds,finished,last_play_at')
      .eq('season', season)
      .eq('week', week),
    client.from('live_worm_state').select('heartbeat_at').eq('id', 1).maybeSingle(),
    // ~3,000 rows a season; paged because of the 1000-row cap.
    fetchAllPages<PlayerRow>((from, to) =>
      client
        .from('nfl_live_players')
        .select('gsis_id,espn_id,full_name,position,team')
        .eq('season', season)
        .order('gsis_id')
        .range(from, to)
    ),
  ]);
  if (gamesRes.error) throw gamesRes.error;
  const games = ((gamesRes.data ?? []) as GameRow[]).map(toFeedGame);
  if (games.length === 0) return null;

  const plays = await fetchAllPages<PlayRow>((from, to) =>
    client
      .from('nfl_live_plays')
      .select('game_id,play_id,play_at,elapsed_seconds,stats')
      .eq('season', season)
      .eq('week', week)
      .order('id')
      .range(from, to)
  );

  return {
    season,
    week,
    heartbeatAt: (stateRes.data as { heartbeat_at: string | null } | null)?.heartbeat_at ?? null,
    games,
    plays: plays.map(toFeedPlay),
    players: playersRes.map(toFeedPlayer),
  };
}

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

const globalForFeed = globalThis as unknown as {
  __rlLiveFeedCache?: CoalescingCache<LiveFeed | null>;
};

function feedCache(): CoalescingCache<LiveFeed | null> {
  if (!globalForFeed.__rlLiveFeedCache) {
    globalForFeed.__rlLiveFeedCache = createCoalescingCache<LiveFeed | null>({
      ttlMs: FEED_TTL_MS,
      maxEntries: 4,
    });
  }
  return globalForFeed.__rlLiveFeedCache;
}

/**
 * The week's feed, shared across requests for a few seconds.
 * Never throws: a failure is logged and reads as no feed.
 */
export async function loadLiveFeed(season: number, week: number): Promise<LiveFeed | null> {
  const started = startTimer();
  try {
    const feed = await feedCache().get(`${season}-${week}`, () => fetchLiveFeed(feedClient(), season, week));
    logDuration('liveFeed: load', started, {
      season,
      week,
      games: feed?.games.length ?? 0,
      plays: feed?.plays.length ?? 0,
    });
    return feed;
  } catch (error) {
    logger.warn({ err: error, season, week }, 'liveFeed: could not load the shared live feed');
    return null;
  }
}

/**
 * Lays the week's feed over a user's teams. Teams come back unchanged when
 * there is no feed for the week.
 *
 * @param teams - The teams as the providers built them.
 * @param options.season - The NFL season.
 * @param options.week - The NFL week the providers are scoring.
 * @param options.sleeperPool - Sleeper's player pool, for direct id joins.
 */
export async function overlayLiveFeed(
  teams: Team[],
  options: { season: number | null; week: number | null; sleeperPool?: Record<string, SleeperPlayer> }
): Promise<Team[]> {
  if (!options.season || !options.week || teams.length === 0) return teams;
  const feed = await loadLiveFeed(options.season, options.week);
  if (!feed) return teams;
  const started = startTimer();
  const context = createLiveFeedContext(feed, createLiveIdResolver(feed.players, options.sleeperPool));
  const overlaid = teams.map((team) => applyLiveFeed(team, context));
  logDuration('liveFeed: overlay', started, { teamCount: teams.length, feedLive: context.feedLive });
  return overlaid;
}
