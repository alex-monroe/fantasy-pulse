import { fetchJson } from '@roster-loom/core';
import logger from '@/utils/logger';

/** Sleeper id -> that week's stat line, in Sleeper keys. */
export type WeeklyStats = Record<string, Record<string, number>>;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const globalForStats = globalThis as typeof globalThis & {
  __rlSleeperWeeklyStats?: Map<string, { at: number; stats: WeeklyStats }>;
};

/**
 * A completed week's player stat lines from Sleeper's public API
 * (`/v1/stats/nfl/regular/{season}/{week}`, about 2,000 players). These are
 * the stat lines scoring inference fits provider points against. Finished
 * weeks barely change, so each one is cached per instance for six hours.
 *
 * @returns The stats, or null when Sleeper can't be reached.
 */
export async function getSleeperWeeklyStats(season: string | number, week: number): Promise<WeeklyStats | null> {
  const key = `${season}:${week}`;
  const cache = (globalForStats.__rlSleeperWeeklyStats ??= new Map());
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.stats;

  const { data, error } = await fetchJson<Record<string, unknown>>(
    `https://api.sleeper.app/v1/stats/nfl/regular/${season}/${week}`
  );
  if (error || !data || typeof data !== 'object') {
    logger.warn({ season, week, error }, 'league-scoring: Sleeper weekly stats unavailable');
    return null;
  }

  const stats: WeeklyStats = {};
  for (const [playerId, raw] of Object.entries(data)) {
    // The endpoint has returned both { id: stats } and { id: { stats } } shapes.
    const line = (raw && typeof raw === 'object' && 'stats' in (raw as object) ? (raw as any).stats : raw) as
      | Record<string, unknown>
      | null;
    if (!line || typeof line !== 'object') continue;
    const numeric: Record<string, number> = {};
    for (const [stat, value] of Object.entries(line)) {
      if (typeof value === 'number' && Number.isFinite(value)) numeric[stat] = value;
    }
    stats[playerId] = numeric;
  }
  cache.set(key, { at: Date.now(), stats });
  return stats;
}
