/**
 * Fetching the player-news feed and persisting it.
 *
 * The feed is public and identical for every user, so it is ingested once
 * into the shared `fp_news_items` pool rather than per user. Reading that
 * pool and matching it to a user's rosters is `digest.ts`'s job.
 *
 * Two things call in here: the cron endpoint
 * (`apps/web/src/app/api/news/ingest/route.ts`) on a schedule, and the
 * digest itself when it notices the pool has gone stale — so the page
 * works on a deployment with no scheduler wired up.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { annotateNewsItem, parseNewsFeed, type NewsItem } from '@roster-loom/core';

import { createServiceRoleClient } from '@/utils/supabase/service';
import { logDuration, startTimer } from '@/utils/performance-logger';
import {
  getRotowireFeedUrl,
  NEWS_FRESHNESS_MS,
  ROTOWIRE_SOURCE,
} from './source';

/**
 * How many guids to ask about at once when checking which items are
 * already stored. PostgREST sends `in` lists in the query string, so an
 * unbounded list becomes an unbounded URL.
 */
const GUID_LOOKUP_CHUNK_SIZE = 100;

/** What one ingest run did. */
export interface NewsIngestResult {
  source: string;
  /** Items the feed returned and we could parse. */
  itemCount: number;
  /** Of those, how many were not already stored. */
  newItemCount: number;
  /** True when the run was skipped because the pool was still fresh. */
  skipped: boolean;
  /** Set when the run failed; `itemCount` is then 0. */
  error?: string;
}

/**
 * Fetches and parses the feed.
 *
 * @param url - Feed URL. Defaults to the configured Rotowire feed.
 * @returns The parsed, player-annotated items.
 * @throws When the feed is unreachable or answers with a non-2xx status.
 */
export async function fetchNewsItems(url = getRotowireFeedUrl()): Promise<NewsItem[]> {
  const fetchStart = startTimer();

  // The feed is a document, not an API: no auth, and Rotowire serves it
  // to anything that asks politely. `cache: 'no-store'` because the whole
  // point of a run is to see what changed.
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      'user-agent': 'RosterLoom/1.0 (+https://github.com/alex-monroe/fantasy-pulse)',
    },
  });

  logDuration('news ingest: fetch feed', fetchStart, {
    status: response.status,
    ok: response.ok,
    url,
  });

  if (!response.ok) {
    throw new Error(`News feed request failed with status ${response.status}`);
  }

  const body = await response.text();

  const parseStart = startTimer();
  const items = parseNewsFeed(body).map(annotateNewsItem);
  logDuration('news ingest: parse feed', parseStart, {
    bytes: body.length,
    itemCount: items.length,
  });

  return items;
}

/** One `fp_news_items` row as the ingest writes it. */
function toRow(item: NewsItem, source: string, fetchedAt: string) {
  return {
    source,
    guid: item.guid,
    title: item.title,
    headline: item.headline,
    link: item.link,
    summary: item.description,
    author: item.author,
    published_at: item.publishedAt,
    player_name: item.playerName,
    player_key: item.playerKey,
    position: item.position,
    nfl_team: item.nflTeam,
    search_text: item.searchText,
    fetched_at: fetchedAt,
  };
}

/**
 * Reads when the given source was last ingested successfully.
 *
 * @param client - A Supabase client with read access.
 * @param source - The feed's source name.
 * @returns The timestamp in epoch ms, or `null` when never ingested.
 */
export async function getLastIngestedAt(
  client: SupabaseClient,
  source = ROTOWIRE_SOURCE,
): Promise<number | null> {
  const { data, error } = await client
    .from('fp_news_ingests')
    .select('last_fetched_at')
    .eq('source', source)
    .maybeSingle();

  if (error || !data?.last_fetched_at) {
    return null;
  }

  const parsed = new Date(data.last_fetched_at).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/** Options for {@link ingestNews}. */
export interface IngestNewsOptions {
  /** Feed URL override. */
  url?: string;
  /** Source name to store items under. */
  source?: string;
  /**
   * Run even when the pool is still fresh. The cron endpoint sets this;
   * the on-demand refresh from the page does not.
   */
  force?: boolean;
  /** Client override, for tests. */
  client?: SupabaseClient;
}

/**
 * Runs one ingest: fetch the feed, upsert its items, stamp the run.
 *
 * Upserting on `(source, guid)` means re-ingesting an unchanged feed is a
 * no-op on content and only refreshes `fetched_at` — feeds repeat their
 * recent items on every poll, and an item's body can be edited after
 * publication, so last-write-wins is what we want.
 *
 * Failures are recorded on the bookkeeping row and returned, not thrown:
 * a page render that triggers an opportunistic ingest must not 500
 * because Rotowire had a bad minute.
 *
 * @param options - See {@link IngestNewsOptions}.
 * @returns What the run did.
 */
export async function ingestNews(
  options: IngestNewsOptions = {},
): Promise<NewsIngestResult> {
  const overallStart = startTimer();
  const source = options.source ?? ROTOWIRE_SOURCE;

  let client: SupabaseClient;
  try {
    // `fp_news_items` grants SELECT to everyone and INSERT to nobody,
    // so the writes below need the service role key. Without it the
    // ingest cannot run — better a clear error than rows silently
    // rejected by RLS.
    client = options.client ?? createServiceRoleClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logDuration('news ingest total', overallStart, { source, result: 'no-client' });
    return { source, itemCount: 0, newItemCount: 0, skipped: false, error: message };
  }

  if (!options.force) {
    const lastFetchedAt = await getLastIngestedAt(client, source);
    if (lastFetchedAt !== null && Date.now() - lastFetchedAt < NEWS_FRESHNESS_MS) {
      logDuration('news ingest total', overallStart, { source, result: 'fresh' });
      return { source, itemCount: 0, newItemCount: 0, skipped: true };
    }
  }

  const fetchedAt = new Date().toISOString();

  let items: NewsItem[];
  try {
    items = await fetchNewsItems(options.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[news] feed fetch failed', message);
    await recordIngest(client, source, { error: message });
    logDuration('news ingest total', overallStart, { source, result: 'fetch-failed' });
    return { source, itemCount: 0, newItemCount: 0, skipped: false, error: message };
  }

  if (items.length === 0) {
    // An empty parse is more likely a shape change at the source than a
    // genuinely empty feed, so it is recorded as a failure rather than
    // stamping the run fresh and hiding it for the next 15 minutes.
    const message = 'News feed returned no parseable items';
    await recordIngest(client, source, { error: message });
    logDuration('news ingest total', overallStart, { source, result: 'empty' });
    return { source, itemCount: 0, newItemCount: 0, skipped: false, error: message };
  }

  // Which guids we already had, so the run can report what is genuinely
  // new rather than just how big the feed is. Chunked because PostgREST
  // puts `in` lists in the query string, and a long feed would otherwise
  // build a URL long enough to be rejected.
  const guids = items.map((item) => item.guid);
  const existingGuids = new Set<string>();

  for (let offset = 0; offset < guids.length; offset += GUID_LOOKUP_CHUNK_SIZE) {
    const chunk = guids.slice(offset, offset + GUID_LOOKUP_CHUNK_SIZE);
    const { data } = await client
      .from('fp_news_items')
      .select('guid')
      .eq('source', source)
      .in('guid', chunk);

    for (const row of data ?? []) {
      existingGuids.add(row.guid as string);
    }
  }

  const newItemCount = guids.filter((guid) => !existingGuids.has(guid)).length;

  const upsertStart = startTimer();
  const { error: upsertError } = await client
    .from('fp_news_items')
    .upsert(
      items.map((item) => toRow(item, source, fetchedAt)),
      { onConflict: 'source,guid' },
    );
  logDuration('news ingest: upsert items', upsertStart, {
    source,
    itemCount: items.length,
    newItemCount,
  });

  if (upsertError) {
    console.error('[news] upsert failed', upsertError.message);
    await recordIngest(client, source, { error: upsertError.message });
    logDuration('news ingest total', overallStart, { source, result: 'upsert-failed' });
    return {
      source,
      itemCount: items.length,
      newItemCount: 0,
      skipped: false,
      error: upsertError.message,
    };
  }

  await recordIngest(client, source, {
    itemCount: items.length,
    newItemCount,
    fetchedAt,
  });

  logDuration('news ingest total', overallStart, {
    source,
    result: 'success',
    itemCount: items.length,
    newItemCount,
  });

  return { source, itemCount: items.length, newItemCount, skipped: false };
}

/**
 * Stamps the bookkeeping row for a run.
 *
 * A failed run records the error but leaves `last_fetched_at` moving
 * forward anyway — otherwise a persistently broken feed would have every
 * page render retry it, turning one outage into a slow site.
 */
async function recordIngest(
  client: SupabaseClient,
  source: string,
  run: { itemCount?: number; newItemCount?: number; fetchedAt?: string; error?: string },
): Promise<void> {
  const { error } = await client.from('fp_news_ingests').upsert(
    {
      source,
      last_fetched_at: run.fetchedAt ?? new Date().toISOString(),
      item_count: run.itemCount ?? 0,
      new_item_count: run.newItemCount ?? 0,
      last_error: run.error ?? null,
    },
    { onConflict: 'source' },
  );

  if (error) {
    console.error('[news] failed to record ingest run', error.message);
  }
}
