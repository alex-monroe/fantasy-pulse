/**
 * A short-lived, per-key cache that also coalesces concurrent loads.
 *
 * `getTeams()` fans out to 1–3 external providers, and several surfaces call
 * it for the same user within moments of each other (the home page, the news
 * digest, the matchup report, MCP tool calls). Sharing one in-flight build,
 * and reusing its result for a few seconds, means those callers pay for the
 * fan-out once instead of once each.
 *
 * The cache is per server instance, so it bounds duplicate work rather than
 * guaranteeing it away. Failures are never cached.
 */

type Entry<T> = {
  promise: Promise<T>;
  /** Epoch ms after which the entry stops satisfying new callers. */
  expiresAt: number;
};

export type CoalescingCacheOptions<T> = {
  ttlMs: number;
  maxEntries: number;
  /** Return false to drop a settled value instead of caching it. */
  shouldCache?: (value: T) => boolean;
  now?: () => number;
};

export type CoalescingCache<T> = {
  get(
    key: string,
    load: () => Promise<T>,
    options?: { fresh?: boolean }
  ): Promise<T>;
  clear(): void;
  size(): number;
};

export function createCoalescingCache<T>({
  ttlMs,
  maxEntries,
  shouldCache = () => true,
  now = Date.now,
}: CoalescingCacheOptions<T>): CoalescingCache<T> {
  const entries = new Map<string, Entry<T>>();

  const evictExpired = () => {
    const current = now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= current) {
        entries.delete(key);
      }
    }
  };

  return {
    get(key, load, { fresh = false } = {}) {
      const existing = entries.get(key);

      // While a load is in flight its expiresAt is Infinity, so everyone
      // joins it — even a `fresh` caller, whose data would be no newer than
      // the build already underway.
      if (existing) {
        const inFlight = existing.expiresAt === Number.POSITIVE_INFINITY;
        if (inFlight || (!fresh && existing.expiresAt > now())) {
          return existing.promise;
        }
      }

      if (entries.size >= maxEntries) {
        evictExpired();
        if (entries.size >= maxEntries) {
          // Still full of live entries: drop the oldest (Map keeps insertion order).
          const oldest = entries.keys().next().value;
          if (oldest !== undefined) {
            entries.delete(oldest);
          }
        }
      }

      const entry: Entry<T> = {
        promise: undefined as unknown as Promise<T>,
        expiresAt: Number.POSITIVE_INFINITY,
      };
      entry.promise = load().then(
        (value) => {
          if (entries.get(key) === entry) {
            if (shouldCache(value)) {
              entry.expiresAt = now() + ttlMs;
            } else {
              entries.delete(key);
            }
          }
          return value;
        },
        (error) => {
          if (entries.get(key) === entry) {
            entries.delete(key);
          }
          throw error;
        }
      );
      entries.set(key, entry);
      return entry.promise;
    },

    clear() {
      entries.clear();
    },

    size() {
      return entries.size;
    },
  };
}

const TEAMS_SNAPSHOT_TTL_MS = 15_000;
const TEAMS_SNAPSHOT_MAX_ENTRIES = 200;

type TeamsResultLike = { teams?: unknown[]; error?: string };

// Server actions and route handlers can be bundled with separate copies of
// this module; hanging the cache off globalThis keeps one instance so an
// invalidation from an integration action reaches the readers.
const globalForTeams = globalThis as typeof globalThis & {
  __rlTeamsSnapshotCache?: CoalescingCache<any>;
};

/**
 * The per-user `getTeams()` snapshot cache. Only successful, non-empty results
 * are kept: an empty list is the usual shape of a transient provider failure,
 * and we'd rather retry that on the next request than pin it for the TTL.
 */
export function getTeamsSnapshotCache(): CoalescingCache<any> {
  if (!globalForTeams.__rlTeamsSnapshotCache) {
    globalForTeams.__rlTeamsSnapshotCache = createCoalescingCache<TeamsResultLike>({
      ttlMs: TEAMS_SNAPSHOT_TTL_MS,
      maxEntries: TEAMS_SNAPSHOT_MAX_ENTRIES,
      shouldCache: (result) =>
        !result.error && Array.isArray(result.teams) && result.teams.length > 0,
    });
  }
  return globalForTeams.__rlTeamsSnapshotCache;
}

/**
 * Drops every cached snapshot. Call after connecting or removing an
 * integration so the next render reflects it immediately rather than after
 * the TTL. Clearing all users is deliberate: the removal actions know only an
 * integration id, and a cold rebuild for a few users is cheap.
 */
export function invalidateTeamsSnapshots(): void {
  globalForTeams.__rlTeamsSnapshotCache?.clear();
}
