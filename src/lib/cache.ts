const GLOBAL_CACHE_KEY = '__fantasyPulseCacheStore__';
const PLAYER_INFO_PREFIX = 'player-info:';
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const MS_IN_DAY = 24 * 60 * 60 * 1000;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type CacheStore = Map<string, CacheEntry<unknown>>;

type GlobalWithCache = typeof globalThis & {
  [GLOBAL_CACHE_KEY]?: CacheStore;
};

function getCacheStore(): CacheStore {
  const globalWithCache = globalThis as GlobalWithCache;
  if (!globalWithCache[GLOBAL_CACHE_KEY]) {
    globalWithCache[GLOBAL_CACHE_KEY] = new Map();
  }
  return globalWithCache[GLOBAL_CACHE_KEY]!;
}

function getCachedValue<T>(key: string): T | undefined {
  const store = getCacheStore();
  const entry = store.get(key);
  if (!entry) {
    return undefined;
  }

  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return undefined;
  }

  return entry.value as T;
}

function setCachedValue<T>(key: string, value: T, ttlMs: number) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return;
  }

  const store = getCacheStore();
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function getTimezoneOffsetInMilliseconds(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  const year = Number(map.get('year'));
  const month = Number(map.get('month'));
  const day = Number(map.get('day'));
  const hour = Number(map.get('hour'));
  const minute = Number(map.get('minute'));
  const second = Number(map.get('second'));

  if (
    [year, month, day, hour, minute, second].some((value) => Number.isNaN(value))
  ) {
    return 0;
  }

  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUTC - date.getTime();
}

function getPacificMidnightTimestamp(year: number, month: number, day: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimezoneOffsetInMilliseconds(guess, PACIFIC_TIME_ZONE);
  return guess.getTime() - offset;
}

function getMillisecondsUntilNextPacificMidnight(now: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = dtf.formatToParts(now);
  const map = new Map(parts.map((part) => [part.type, part.value]));

  const year = Number(map.get('year'));
  const month = Number(map.get('month'));
  const day = Number(map.get('day'));

  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return MS_IN_DAY;
  }

  const nextDate = new Date(Date.UTC(year, month - 1, day));
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);

  const nextYear = nextDate.getUTCFullYear();
  const nextMonth = nextDate.getUTCMonth() + 1;
  const nextDay = nextDate.getUTCDate();

  const nextMidnightTs = getPacificMidnightTimestamp(nextYear, nextMonth, nextDay);
  const nowMs = now.getTime();
  return Math.max(nextMidnightTs - nowMs, 0);
}

export function getPlayerInfoCacheTtlMs(now = new Date()): number {
  const msUntilMidnight = getMillisecondsUntilNextPacificMidnight(now);
  if (!Number.isFinite(msUntilMidnight) || msUntilMidnight <= 0) {
    return MS_IN_DAY;
  }

  return Math.min(MS_IN_DAY, msUntilMidnight);
}

export function getCachedPlayerInfo<T>(key: string): T | undefined {
  return getCachedValue<T>(`${PLAYER_INFO_PREFIX}${key}`);
}

export function setCachedPlayerInfo<T>(key: string, value: T, now = new Date()) {
  const ttl = getPlayerInfoCacheTtlMs(now);
  setCachedValue(`${PLAYER_INFO_PREFIX}${key}`, value, ttl);
}

export function clearPlayerInfoCache(key?: string) {
  const store = getCacheStore();

  if (!key) {
    for (const cacheKey of Array.from(store.keys())) {
      if (cacheKey.startsWith(PLAYER_INFO_PREFIX)) {
        store.delete(cacheKey);
      }
    }
    return;
  }

  store.delete(`${PLAYER_INFO_PREFIX}${key}`);
}

export const __testing = {
  getMillisecondsUntilNextPacificMidnight,
  getPacificMidnightTimestamp,
  getTimezoneOffsetInMilliseconds,
};
