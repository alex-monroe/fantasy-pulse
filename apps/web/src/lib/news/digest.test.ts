/**
 * @jest-environment node
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Player, Team } from '@roster-loom/core';

const ingestNews = jest.fn();
const getLastIngestedAt = jest.fn();

jest.mock('./ingest', () => ({
  ingestNews: (...args: unknown[]) => ingestNews(...args),
  getLastIngestedAt: (...args: unknown[]) => getLastIngestedAt(...args),
}));

jest.mock('@/utils/supabase/server', () => ({
  createClient: () => {
    throw new Error('createClient should not be reached when a client is injected');
  },
}));

import { getNewsDigest, loadRecentNews, rowToNewsItem } from './digest';
import { NEWS_FRESHNESS_MS } from './source';

const makePlayer = (overrides: Partial<Player> & Pick<Player, 'name'>): Player => ({
  id: overrides.name,
  position: 'RB',
  realTeam: 'IND',
  score: 0,
  gameStatus: 'pregame',
  gameStartTime: null,
  gameQuarter: null,
  gameClock: null,
  onUserTeams: 1,
  onOpponentTeams: 0,
  gameDetails: { score: '', timeRemaining: '', fieldPosition: '' },
  imageUrl: '',
  onBench: false,
  ...overrides,
});

const teams: Team[] = [
  {
    id: 1,
    name: 'Team A',
    league: { provider: 'sleeper', providerLeagueId: 'l1', name: 'League One' },
    totalScore: 0,
    players: [makePlayer({ name: 'Jonathan Taylor' })],
    opponent: { name: 'Rival', totalScore: 0, players: [] },
  },
];

const ROW = {
  guid: 'news-1',
  title: 'Jonathan Taylor - RB - IND: Practices fully Wednesday',
  headline: 'Practices fully Wednesday',
  link: 'https://example.com/taylor',
  summary: 'Taylor was a full participant.',
  author: 'RotoWire Staff',
  published_at: '2026-09-09T18:30:00.000Z',
  player_name: 'Jonathan Taylor',
  player_key: 'jonathan taylor',
  position: 'RB',
  nfl_team: 'IND',
  search_text: ' jonathan taylor rb ind practices fully wednesday ',
};

/** A Supabase double returning a fixed set of `fp_news_items` rows. */
function makeClient(rows: unknown[] = [ROW], error?: string) {
  const calls: Record<string, unknown> = {};

  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      calls[column] = value;
      return builder;
    },
    gte: (column: string, value: unknown) => {
      calls[column] = value;
      return builder;
    },
    order: () => builder,
    limit: async (value: number) => {
      calls.limit = value;
      return { data: error ? null : rows, error: error ? { message: error } : null };
    },
  };

  return {
    calls,
    client: { from: () => builder } as unknown as SupabaseClient,
  };
}

beforeEach(() => {
  ingestNews.mockReset().mockResolvedValue({ itemCount: 2, newItemCount: 1, skipped: false });
  getLastIngestedAt.mockReset().mockResolvedValue(Date.now());
});

describe('rowToNewsItem', () => {
  it('restores the shape the matcher takes', () => {
    expect(rowToNewsItem(ROW)).toMatchObject({
      guid: 'news-1',
      description: 'Taylor was a full participant.',
      publishedAt: '2026-09-09T18:30:00.000Z',
      playerKey: 'jonathan taylor',
      headline: 'Practices fully Wednesday',
    });
  });

  it('falls back to the title when an item stored no parsed headline', () => {
    expect(rowToNewsItem({ ...ROW, headline: null }).headline).toBe(ROW.title);
  });

  it('tolerates null text columns', () => {
    expect(rowToNewsItem({ ...ROW, summary: null, search_text: null })).toMatchObject({
      description: '',
      searchText: '',
    });
  });
});

describe('loadRecentNews', () => {
  it('reads a bounded, source-scoped window newest first', async () => {
    const { client, calls } = makeClient();

    const { items, error } = await loadRecentNews(client, { windowDays: 3, limit: 10 });

    expect(error).toBeUndefined();
    expect(items).toHaveLength(1);
    expect(calls.source).toBe('rotowire');
    expect(calls.limit).toBe(10);
    expect(Date.parse(calls.published_at as string)).toBeCloseTo(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
      -4,
    );
  });

  it('surfaces a query failure', async () => {
    const { client } = makeClient([], 'relation does not exist');
    await expect(loadRecentNews(client)).resolves.toMatchObject({
      items: [],
      error: 'relation does not exist',
    });
  });
});

describe('getNewsDigest', () => {
  it('matches the stored pool against the caller’s rosters', async () => {
    const { client } = makeClient();

    const result = await getNewsDigest(teams, { client });

    expect(result.error).toBeUndefined();
    expect(result.itemsConsidered).toBe(1);
    expect(result.digest).toHaveLength(1);
    expect(result.digest[0]).toMatchObject({
      playerName: 'Jonathan Taylor',
      latestPublishedAt: '2026-09-09T18:30:00.000Z',
    });
  });

  it('refreshes the pool first when it has gone stale', async () => {
    getLastIngestedAt.mockResolvedValue(Date.now() - NEWS_FRESHNESS_MS - 1000);
    const { client } = makeClient();

    await getNewsDigest(teams, { client });

    expect(ingestNews).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the pool has never been ingested', async () => {
    getLastIngestedAt.mockResolvedValue(null);
    const { client } = makeClient();

    await getNewsDigest(teams, { client });

    expect(ingestNews).toHaveBeenCalledTimes(1);
  });

  it('leaves a fresh pool alone', async () => {
    const { client } = makeClient();

    await getNewsDigest(teams, { client });

    expect(ingestNews).not.toHaveBeenCalled();
  });

  it('honors skipRefresh even when the pool is stale', async () => {
    getLastIngestedAt.mockResolvedValue(null);
    const { client } = makeClient();

    await getNewsDigest(teams, { client, skipRefresh: true });

    expect(ingestNews).not.toHaveBeenCalled();
  });

  it('still renders stored news when the refresh fails', async () => {
    getLastIngestedAt.mockResolvedValue(null);
    ingestNews.mockResolvedValue({ itemCount: 0, newItemCount: 0, skipped: false, error: 'feed down' });
    const { client } = makeClient();

    const result = await getNewsDigest(teams, { client });

    expect(result.error).toBeUndefined();
    expect(result.digest).toHaveLength(1);
    expect(result.lastIngestedAt).toBeNull();
  });

  it('reports a pool that cannot be read', async () => {
    const { client } = makeClient([], 'boom');

    await expect(getNewsDigest(teams, { client })).resolves.toMatchObject({
      digest: [],
      error: 'boom',
    });
  });

  it('serves generated news in demo mode without touching Supabase or the feed', async () => {
    const result = await getNewsDigest(teams, { demo: true });

    expect(ingestNews).not.toHaveBeenCalled();
    expect(getLastIngestedAt).not.toHaveBeenCalled();
    expect(result.itemsConsidered).toBeGreaterThan(0);
  });
});
