import { fetchJson } from '@roster-loom/core';

/**
 * Status codes Yahoo returns when it is throttling or briefly unavailable.
 * Yahoo's API terms ask clients to handle rate limiting with retry logic
 * and exponential backoff, so these are retried; everything else
 * (401 expired token, 400 bad key, ...) is returned immediately.
 */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504, 999]);

export type YahooGetOptions = {
  /** Total attempts including the first one. */
  maxAttempts?: number;
  /** Delay before the first retry; doubles on each subsequent retry. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * GET a Yahoo Fantasy Sports API resource.
 *
 * Two rules from Yahoo's Fantasy API terms live here so every call
 * site gets them:
 * - Responses are never written to the Next.js data cache (Yahoo's terms
 *   forbid storing or caching Yahoo Fantasy data), so
 *   `disableCache` is always set.
 * - Throttled / transient failures are retried with exponential backoff
 *   rather than hammering the API.
 */
export async function yahooGet<T>(
  url: string,
  accessToken: string,
  { maxAttempts = 3, baseDelayMs = 300, sleep = defaultSleep }: YahooGetOptions = {}
): Promise<{ data?: T; error?: string; status?: number }> {
  let result: { data?: T; error?: string; status?: number } = {};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = await fetchJson<T>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
      disableCache: true,
    });

    const retryable = result.error && result.status !== undefined && RETRYABLE_STATUSES.has(result.status);
    if (!retryable || attempt === maxAttempts) {
      return result;
    }
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }
  return result;
}
