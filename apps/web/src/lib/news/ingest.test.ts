/**
 * @jest-environment node
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchNewsItems, getLastIngestedAt, ingestNews } from './ingest';
import { NEWS_FRESHNESS_MS } from './source';

const FEED = `<rss version="2.0"><channel>
  <item>
    <title>Jonathan Taylor - RB - IND: Practices fully Wednesday</title>
    <link>https://example.com/taylor</link>
    <description>Taylor was a full participant.</description>
    <pubDate>Wed, 09 Sep 2026 18:30:00 +0000</pubDate>
    <guid>news-1</guid>
  </item>
  <item>
    <title>Tyreek Hill - WR - MIA: Questionable</title>
    <link>https://example.com/hill</link>
    <description>Hill is questionable with a wrist injury.</description>
    <pubDate>Wed, 09 Sep 2026 19:00:00 +0000</pubDate>
    <guid>news-2</guid>
  </item>
</channel></rss>`;

/**
 * A Supabase test double covering only the calls the ingest makes:
 * a select of existing guids, an upsert of items, and the bookkeeping
 * upsert. Every call is recorded so tests can assert on the writes.
 */
function makeClient(options: { existingGuids?: string[]; lastFetchedAt?: string | null; upsertError?: string } = {}) {
  const upserts: { table: string; rows: any }[] = [];

  const client = {
    upserts,
    from(table: string) {
      if (table === 'fp_news_ingests') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: options.lastFetchedAt ? { last_fetched_at: options.lastFetchedAt } : null,
                error: null,
              }),
            }),
          }),
          upsert: async (rows: any) => {
            upserts.push({ table, rows });
            return { error: null };
          },
        };
      }

      return {
        select: () => ({
          eq: () => ({
            in: async () => ({
              data: (options.existingGuids ?? []).map((guid) => ({ guid })),
              error: null,
            }),
          }),
        }),
        upsert: async (rows: any) => {
          upserts.push({ table, rows });
          return { error: options.upsertError ? { message: options.upsertError } : null };
        },
      };
    },
  };

  return client as unknown as SupabaseClient & { upserts: typeof upserts };
}

describe('fetchNewsItems', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and annotates the feed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => FEED,
    }) as unknown as typeof fetch;

    const items = await fetchNewsItems('https://example.com/feed.xml');

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      guid: 'news-1',
      playerName: 'Jonathan Taylor',
      playerKey: 'jonathan taylor',
      position: 'RB',
      nflTeam: 'IND',
      headline: 'Practices fully Wednesday',
    });
  });

  it('throws on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => '',
    }) as unknown as typeof fetch;

    await expect(fetchNewsItems('https://example.com/feed.xml')).rejects.toThrow(
      'status 503',
    );
  });
});

describe('getLastIngestedAt', () => {
  it('reads the stored timestamp', async () => {
    const client = makeClient({ lastFetchedAt: '2026-09-10T12:00:00.000Z' });
    await expect(getLastIngestedAt(client)).resolves.toBe(
      Date.parse('2026-09-10T12:00:00.000Z'),
    );
  });

  it('returns null when the source has never been ingested', async () => {
    await expect(getLastIngestedAt(makeClient())).resolves.toBeNull();
  });
});

describe('ingestNews', () => {
  const okFetch = () =>
    (global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => FEED,
    }) as unknown as typeof fetch);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('counts new items across more than one guid-lookup chunk', async () => {
    // 250 items forces three lookup chunks; the double answers each the
    // same way, so every item reads as already stored.
    const manyItems = Array.from(
      { length: 250 },
      (_, index) =>
        `<item><title>Player ${index} - RB - IND: Note</title><guid>news-${index}</guid><pubDate>Wed, 09 Sep 2026 18:30:00 +0000</pubDate></item>`,
    ).join('');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<rss><channel>${manyItems}</channel></rss>`,
    }) as unknown as typeof fetch;

    const client = makeClient({ existingGuids: ['news-0'] });
    const result = await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(result.itemCount).toBe(250);
    // 'news-0' comes back from every chunk, so exactly one is not new.
    expect(result.newItemCount).toBe(249);
  });

  it('upserts every item and counts the ones that are new', async () => {
    okFetch();
    const client = makeClient({ existingGuids: ['news-1'] });

    const result = await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(result).toMatchObject({ itemCount: 2, newItemCount: 1, skipped: false });
    expect(result.error).toBeUndefined();

    const itemsUpsert = client.upserts.find((call) => call.table === 'fp_news_items');
    expect(itemsUpsert?.rows).toHaveLength(2);
    expect(itemsUpsert?.rows[0]).toMatchObject({
      source: 'rotowire',
      guid: 'news-1',
      player_key: 'jonathan taylor',
      headline: 'Practices fully Wednesday',
    });
  });

  it('skips the run when the pool is still fresh', async () => {
    const fetchSpy = okFetch();
    const client = makeClient({ lastFetchedAt: new Date().toISOString() });

    const result = await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(result.skipped).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('runs anyway when forced', async () => {
    const fetchSpy = okFetch();
    const client = makeClient({ lastFetchedAt: new Date().toISOString() });

    const result = await ingestNews({
      client,
      url: 'https://example.com/feed.xml',
      force: true,
    });

    expect(result.skipped).toBe(false);
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('runs when the last ingest has aged out', async () => {
    const fetchSpy = okFetch();
    const client = makeClient({
      lastFetchedAt: new Date(Date.now() - NEWS_FRESHNESS_MS - 1000).toISOString(),
    });

    await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(fetchSpy).toHaveBeenCalled();
  });

  it('records a fetch failure instead of throwing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const client = makeClient();

    const result = await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(result).toMatchObject({ itemCount: 0, newItemCount: 0, error: 'network down' });
    expect(client.upserts).toEqual([
      expect.objectContaining({
        table: 'fp_news_ingests',
        rows: expect.objectContaining({ last_error: 'network down' }),
      }),
    ]);
  });

  it('treats an unparseable feed as a failure rather than an empty refresh', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html>not a feed</html>',
    }) as unknown as typeof fetch;
    const client = makeClient();

    const result = await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(result.error).toMatch(/no parseable items/);
    expect(client.upserts.some((call) => call.table === 'fp_news_items')).toBe(false);
  });

  it('reports an upsert failure', async () => {
    okFetch();
    const client = makeClient({ upsertError: 'permission denied' });

    const result = await ingestNews({ client, url: 'https://example.com/feed.xml' });

    expect(result).toMatchObject({ newItemCount: 0, error: 'permission denied' });
  });

  it('fails cleanly when no service role key is configured', async () => {
    const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      const result = await ingestNews({ url: 'https://example.com/feed.xml' });
      expect(result.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    } finally {
      if (original !== undefined) {
        process.env.SUPABASE_SERVICE_ROLE_KEY = original;
      }
    }
  });
});
