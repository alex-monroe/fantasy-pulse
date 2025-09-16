import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

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
export async function getFromCache<T>(key: string): Promise<T | null> {
  await ensureCacheDir();
  const dateString = getPacificDateString();
  const cacheFile = path.join(CACHE_DIR, `${key}-${dateString}.json`);

  try {
    const data = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
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
  } catch (error) {
    console.error(`Failed to write to cache file ${cacheFile}:`, error);
  }
}
