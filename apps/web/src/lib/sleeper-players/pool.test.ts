import {
  ingestSleeperPlayers,
  loadStoredSleeperPlayers,
  slimSleeperPlayers,
  SLEEPER_POOL_MAX_AGE_MS,
} from './pool';

jest.mock('@/utils/supabase/service', () => ({ createServiceRoleClient: jest.fn() }));

const bigPool = () =>
  Object.fromEntries(
    Array.from({ length: 1200 }, (_, i) => [
      String(i),
      { full_name: `P ${i}`, position: 'WR', team: 'SEA', injury_notes: 'x'.repeat(50), metadata: { a: 1 } },
    ])
  );

const supabaseWith = (result: unknown) => {
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const client: any = {
    from: jest.fn(() => ({ upsert, select: () => ({ eq: () => ({ maybeSingle }) }) })),
  };
  return { client, upsert };
};

describe('slimSleeperPlayers', () => {
  it('keeps only the fields the app reads and drops nulls', () => {
    const slim = slimSleeperPlayers({
      '1': { full_name: 'A B', team: null, active: false, search_rank: 5, injury_notes: 'zzz' },
      '2': null,
    });
    expect(slim).toEqual({ '1': { full_name: 'A B', active: false, search_rank: 5 } });
  });

  it('returns an empty map for a non-object payload', () => {
    expect(slimSleeperPlayers(null)).toEqual({});
    expect(slimSleeperPlayers('nope')).toEqual({});
  });
});

describe('ingestSleeperPlayers', () => {
  it('stores the slimmed pool', async () => {
    const { client, upsert } = supabaseWith({});
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => bigPool() });

    const result = await ingestSleeperPlayers({ fetchImpl: fetchImpl as any, client });

    expect(result).toEqual({ playerCount: 1200 });
    const row = upsert.mock.calls[0][0];
    expect(row).toMatchObject({ id: 'nfl', player_count: 1200 });
    expect(row.players['0']).toEqual({ full_name: 'P 0', position: 'WR', team: 'SEA' });
  });

  it('refuses to overwrite the pool with an implausibly small payload', async () => {
    const { client, upsert } = supabaseWith({});
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ '1': {} }) });

    const result = await ingestSleeperPlayers({ fetchImpl: fetchImpl as any, client });

    expect(result.error).toMatch(/looks wrong/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('reports an upstream failure without writing', async () => {
    const { client, upsert } = supabaseWith({});
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    const result = await ingestSleeperPlayers({ fetchImpl: fetchImpl as any, client });

    expect(result.error).toMatch(/503/);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('loadStoredSleeperPlayers', () => {
  const now = Date.parse('2026-09-19T12:00:00Z');

  it('returns a fresh stored pool', async () => {
    const { client } = supabaseWith({
      data: { players: { '1': { full_name: 'A' } }, fetched_at: '2026-09-19T09:00:00Z' },
      error: null,
    });
    const result = await loadStoredSleeperPlayers({ client, now: () => now });
    expect(result?.players).toEqual({ '1': { full_name: 'A' } });
  });

  it('ignores a pool older than the max age', async () => {
    const old = new Date(now - SLEEPER_POOL_MAX_AGE_MS - 60_000).toISOString();
    const { client } = supabaseWith({ data: { players: { '1': {} }, fetched_at: old }, error: null });
    expect(await loadStoredSleeperPlayers({ client, now: () => now })).toBeNull();
  });

  it('returns null when the row is missing or the read fails', async () => {
    expect(
      await loadStoredSleeperPlayers({ client: supabaseWith({ data: null, error: null }).client })
    ).toBeNull();
    expect(
      await loadStoredSleeperPlayers({
        client: supabaseWith({ data: null, error: { message: 'boom' } }).client,
      })
    ).toBeNull();
  });
});
