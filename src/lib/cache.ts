import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import logger from '@/utils/logger';

const CACHE_DIR = path.join(os.tmpdir(), 'sport-sphere-cache');

/**
 * Gets the current date in YYYY-MM-DD format for the Pacific Time Zone.
 * @returns The current date in PT.
 */
function getPacificDateString(): string {
  const date = new Date();
  const year = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric' });
  const month = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: '2-digit' });
  const day = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', day: '2-digit' });
  return `${year}-${month}-${day}`;
}

/**
 * Ensures the cache directory exists.
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create cache directory:', error);
  }
}

/**
 * Gets a value from the cache.
 * @param key - The cache key.
 * @returns The cached data or null if not found or expired.
 */
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
}

const initialStats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
};

/**
 * Gets the cache statistics for the current day.
 * @returns The cache statistics.
 */
export async function getCacheStats(): Promise<CacheStats> {
  await ensureCacheDir();
  const dateString = getPacificDateString();
  const statsFile = path.join(CACHE_DIR, `stats-${dateString}.json`);

  try {
    const data = await fs.readFile(statsFile, 'utf-8');
    return JSON.parse(data) as CacheStats;
  } catch (error) {
    return initialStats;
  }
}

/**
 * Updates the cache statistics.
 * @param type - The type of statistic to update.
 */
async function updateCacheStats(type: keyof CacheStats): Promise<void> {
  const stats = await getCacheStats();
  stats[type]++;
  const dateString = getPacificDateString();
  const statsFile = path.join(CACHE_DIR, `stats-${dateString}.json`);

  try {
    await fs.writeFile(statsFile, JSON.stringify(stats), 'utf-8');
  } catch (error) {
    logger.error('Failed to update cache stats:', error);
  }
}

export async function getFromCache<T>(key: string): Promise<T | null> {
  await ensureCacheDir();
  const dateString = getPacificDateString();
  const cacheFile = path.join(CACHE_DIR, `${key}-${dateString}.json`);

  try {
    const data = await fs.readFile(cacheFile, 'utf-8');
    logger.info(`Cache hit for key: ${key}`);
    await updateCacheStats('hits');
    return JSON.parse(data) as T;
  } catch (error) {
    logger.info(`Cache miss for key: ${key}`);
    await updateCacheStats('misses');
    return null;
  }
}

/**
 * Sets a value in the cache.
 * @param key - The cache key.
 * @param data - The data to cache.
 */
export async function setInCache<T>(key: string, data: T): Promise<void> {
  await ensureCacheDir();
  const dateString = getPacificDateString();
  const cacheFile = path.join(CACHE_DIR, `${key}-${dateString}.json`);

  try {
    await fs.writeFile(cacheFile, JSON.stringify(data), 'utf-8');
    await updateCacheStats('sets');
  } catch (error) {
    console.error(`Failed to write to cache file ${cacheFile}:`, error);
  }
}
