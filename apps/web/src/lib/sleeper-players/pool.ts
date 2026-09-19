/**
 * The shared Sleeper player pool: ingest into Supabase, read back out.
 *
 * `/v1/players/nfl` is ~15MB and identical for everyone, but the app reads
 * only seven fields of it. Rather than every server instance downloading and
 * parsing the full payload on cold start, a scheduled run stores the slimmed
 * pool in `fp_sleeper_players` and instances read that instead.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SleeperPlayer } from '@roster-loom/core';

import { createServiceRoleClient } from '@/utils/supabase/service';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { syncSleeperPlayerLinks } from './links';

export const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';
export const SLEEPER_PLAYER_POOL_ID = 'nfl';

/**
 * How old a stored pool may be before readers ignore it and fall back to
 * fetching Sleeper directly. The ingest runs daily, so this leaves room for a
 * couple of missed runs before we prefer a live (slow) fetch to stale data.
 */
export const SLEEPER_POOL_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** A payload with fewer players than this is treated as broken, not stored. */
const MIN_PLAUSIBLE_PLAYER_COUNT = 1000;

const KEPT_FIELDS = [
  'full_name',
  'first_name',
  'last_name',
  'position',
  'team',
  'active',
  'search_rank',
] as const satisfies readonly (keyof SleeperPlayer)[];

/**
 * Reduces Sleeper's raw player map to the fields the app reads. Every player
 * is kept: a retired or unsigned player can still sit on a fantasy roster,
 * and dropping them would make them vanish from it.
 * @param raw - The parsed `/v1/players/nfl` payload.
 * @returns The slimmed map, keyed by Sleeper player id.
 */
export function slimSleeperPlayers(raw: unknown): Record<string, SleeperPlayer> {
  const slim: Record<string, SleeperPlayer> = {};
  if (!raw || typeof raw !== 'object') {
    return slim;
  }

  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const source = value as Record<string, unknown>;
    const player: Record<string, unknown> = {};
    for (const field of KEPT_FIELDS) {
      const fieldValue = source[field];
      if (fieldValue !== undefined && fieldValue !== null) {
        player[field] = fieldValue;
      }
    }
    slim[id] = player as SleeperPlayer;
  }

  return slim;
}

export type SleeperPoolIngestResult = {
  playerCount: number;
  /** Sleeper ids linked to `public.players` rows this run. */
  linkedCount?: number;
  /** Set when linking failed; the pool itself was still stored. */
  linkError?: string;
  error?: string;
};

/**
 * Fetches Sleeper's players, slims them and stores them for every instance.
 * A short or malformed payload is rejected so a Sleeper hiccup can never
 * overwrite a good pool with a bad one.
 * @param deps - Injection points for tests.
 * @returns How many players were stored, or the reason nothing was.
 */
export async function ingestSleeperPlayers({
  fetchImpl = fetch,
  client,
}: { fetchImpl?: typeof fetch; client?: SupabaseClient } = {}): Promise<SleeperPoolIngestResult> {
  const start = startTimer();

  try {
    // `no-store`: the payload is far over Next's data-cache size limit, and
    // the point of a run is to see what changed.
    const response = await fetchImpl(SLEEPER_PLAYERS_URL, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Sleeper players request failed with status ${response.status}`);
    }

    const players = slimSleeperPlayers(await response.json());
    const playerCount = Object.keys(players).length;
    if (playerCount < MIN_PLAUSIBLE_PLAYER_COUNT) {
      throw new Error(
        `Sleeper players payload looks wrong (${playerCount} players); keeping the stored pool.`
      );
    }

    const supabase = client ?? createServiceRoleClient();
    const { error } = await supabase.from('fp_sleeper_players').upsert({
      id: SLEEPER_PLAYER_POOL_ID,
      players,
      player_count: playerCount,
      fetched_at: new Date().toISOString(),
    });
    if (error) {
      throw new Error(`Could not store the player pool: ${error.message}`);
    }

    // Linking is additive: the pool is already stored, so a failure here (say
    // the links table isn't migrated yet) is reported but doesn't fail the run.
    let linkedCount: number | undefined;
    let linkError: string | undefined;
    try {
      linkedCount = await syncSleeperPlayerLinks(supabase, players);
    } catch (error) {
      linkError = error instanceof Error ? error.message : String(error);
    }

    logDuration('sleeper players ingest', start, {
      success: true,
      playerCount,
      linkedCount,
      linkError,
    });
    return { playerCount, linkedCount, linkError };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDuration('sleeper players ingest', start, { success: false, errorMessage: message });
    return { playerCount: 0, error: message };
  }
}

/**
 * Reads the stored pool, or null when there is none worth using (missing,
 * unreadable or older than {@link SLEEPER_POOL_MAX_AGE_MS}). Callers fall back
 * to fetching Sleeper directly, so this never throws.
 *
 * Uses a session-less anon client: the data is public and this must work
 * from any context, cookies or not.
 * @param deps - Injection points for tests.
 */
export async function loadStoredSleeperPlayers({
  client,
  now = Date.now,
}: { client?: SupabaseClient; now?: () => number } = {}): Promise<{
  players: Record<string, SleeperPlayer>;
  fetchedAt: string;
} | null> {
  const start = startTimer();

  try {
    const supabase =
      client ??
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      );

    const { data, error } = await supabase
      .from('fp_sleeper_players')
      .select('players, fetched_at')
      .eq('id', SLEEPER_PLAYER_POOL_ID)
      .maybeSingle();

    if (error || !data?.players) {
      logDuration('sleeper players: read stored pool', start, {
        found: false,
        error: error?.message,
      });
      return null;
    }

    const ageMs = now() - new Date(data.fetched_at).getTime();
    const usable = Number.isFinite(ageMs) && ageMs <= SLEEPER_POOL_MAX_AGE_MS;
    logDuration('sleeper players: read stored pool', start, {
      found: true,
      usable,
      ageMinutes: Math.round(ageMs / 60000),
    });

    return usable
      ? { players: data.players as Record<string, SleeperPlayer>, fetchedAt: data.fetched_at }
      : null;
  } catch (error) {
    logDuration('sleeper players: read stored pool', start, {
      found: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
