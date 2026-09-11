/**
 * Reading the shared news pool and matching it to one user's rosters.
 *
 * The pool in `fp_news_items` is public and user-agnostic; everything
 * personal about the digest happens here, at read time, against the
 * `Team[]` `getTeams()` already builds. Nothing about a user's rosters is
 * ever written to the news tables.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildNewsDigest,
  generateDemoNewsItems,
  type BuildNewsDigestOptions,
  type NewsItem,
  type PlayerNewsDigest,
  type Team,
} from '@roster-loom/core';

import { createClient } from '@/utils/supabase/server';
import { logDuration, startTimer } from '@/utils/performance-logger';
import { getLastIngestedAt, ingestNews } from './ingest';
import {
  NEWS_FRESHNESS_MS,
  NEWS_ITEM_LIMIT,
  NEWS_WINDOW_DAYS,
  ROTOWIRE_SOURCE,
} from './source';

/** One `fp_news_items` row as PostgREST returns it. */
type NewsRow = {
  guid: string;
  title: string;
  headline: string | null;
  link: string | null;
  summary: string | null;
  author: string | null;
  published_at: string | null;
  player_name: string | null;
  player_key: string | null;
  position: string | null;
  nfl_team: string | null;
  search_text: string | null;
};

/**
 * Turns a stored row back into the {@link NewsItem} the matcher takes.
 *
 * @param row - A `fp_news_items` row.
 * @returns The item in core's shape.
 */
export function rowToNewsItem(row: NewsRow): NewsItem {
  return {
    guid: row.guid,
    title: row.title,
    link: row.link,
    description: row.summary ?? '',
    publishedAt: row.published_at,
    author: row.author,
    categories: [],
    playerName: row.player_name,
    playerKey: row.player_key,
    position: row.position,
    nflTeam: row.nfl_team,
    headline: row.headline ?? row.title,
    searchText: row.search_text ?? '',
  };
}

/**
 * Loads the recent news window from the shared pool.
 *
 * Bounded two ways — a date window and a row cap — because this runs on
 * every digest render and the pool grows without limit.
 *
 * @param client - Supabase client to read with.
 * @param options.windowDays - How far back to read. Default 7.
 * @param options.limit - Row cap. Default 500.
 * @returns The items, newest first, or an error message.
 */
export async function loadRecentNews(
  client: SupabaseClient,
  options: { windowDays?: number; limit?: number; source?: string } = {},
): Promise<{ items: NewsItem[]; error?: string }> {
  const windowDays = options.windowDays ?? NEWS_WINDOW_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const queryStart = startTimer();
  const { data, error } = await client
    .from('fp_news_items')
    .select(
      'guid, title, headline, link, summary, author, published_at, player_name, player_key, position, nfl_team, search_text',
    )
    .eq('source', options.source ?? ROTOWIRE_SOURCE)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(options.limit ?? NEWS_ITEM_LIMIT);

  logDuration('news digest: load recent items', queryStart, {
    itemCount: data?.length ?? 0,
    hasError: Boolean(error),
  });

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: (data ?? []).map((row) => rowToNewsItem(row as NewsRow)) };
}

/** What {@link getNewsDigest} returns. */
export interface NewsDigestResult {
  /** Players with news, newest news first. */
  digest: PlayerNewsDigest[];
  /** How many items were considered before matching. */
  itemsConsidered: number;
  /** When the pool was last refreshed, ISO, or `null` if never. */
  lastIngestedAt: string | null;
  /** Set when the pool could not be read. */
  error?: string;
}

/** Options for {@link getNewsDigest}. */
export interface GetNewsDigestOptions extends BuildNewsDigestOptions {
  /** Serve deterministic fake news instead of reading the pool. */
  demo?: boolean;
  /** Supabase client override, for tests. */
  client?: SupabaseClient;
  /**
   * Skip the opportunistic ingest even when the pool is stale. Set by
   * callers that must not pay for a feed fetch.
   */
  skipRefresh?: boolean;
}

/**
 * Builds the news digest for a set of teams.
 *
 * When the pool has not been refreshed inside {@link NEWS_FRESHNESS_MS},
 * this triggers an ingest before reading, so the page stays current on a
 * deployment with no scheduler. That refresh is best-effort: if it fails
 * the digest still renders from whatever is already stored.
 *
 * @param teams - The user's teams.
 * @param options - See {@link GetNewsDigestOptions}.
 * @returns The digest and the metadata the page shows alongside it.
 */
export async function getNewsDigest(
  teams: Team[],
  options: GetNewsDigestOptions = {},
): Promise<NewsDigestResult> {
  const overallStart = startTimer();

  if (options.demo) {
    const items = generateDemoNewsItems(Date.now(), { teams });
    const digest = buildNewsDigest(items, teams, options);
    logDuration('news digest total', overallStart, {
      result: 'demo',
      playerCount: digest.length,
    });
    return {
      digest,
      itemsConsidered: items.length,
      lastIngestedAt: new Date().toISOString(),
    };
  }

  const client = options.client ?? createClient();

  let lastIngestedAt = await getLastIngestedAt(client);

  if (!options.skipRefresh) {
    const isStale =
      lastIngestedAt === null || Date.now() - lastIngestedAt >= NEWS_FRESHNESS_MS;

    if (isStale) {
      // Best-effort: `ingestNews` returns its failures rather than
      // throwing, so a bad feed degrades to stale news, not a 500.
      const result = await ingestNews();
      if (!result.error) {
        lastIngestedAt = Date.now();
      }
    }
  }

  const { items, error } = await loadRecentNews(client);

  if (error) {
    logDuration('news digest total', overallStart, { result: 'load-error' });
    return { digest: [], itemsConsidered: 0, lastIngestedAt: null, error };
  }

  const matchStart = startTimer();
  const digest = buildNewsDigest(items, teams, options);
  logDuration('news digest: match to rosters', matchStart, {
    itemCount: items.length,
    playerCount: digest.length,
  });

  logDuration('news digest total', overallStart, {
    result: 'success',
    itemCount: items.length,
    playerCount: digest.length,
  });

  return {
    digest,
    itemsConsidered: items.length,
    lastIngestedAt: lastIngestedAt ? new Date(lastIngestedAt).toISOString() : null,
  };
}
