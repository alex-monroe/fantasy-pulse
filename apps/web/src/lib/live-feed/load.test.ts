import { fetchLiveFeed } from './load';

jest.mock('@/utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));

type Rows = Record<string, unknown[]>;

/**
 * Just enough of the Supabase query builder for fetchLiveFeed: each chain
 * resolves to its table's rows, sliced by `.range()` when one is given.
 */
function fakeClient(rows: Rows) {
  return {
    from(table: string) {
      let range: [number, number] | null = null;
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          range = [from, to];
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          const all = rows[table] ?? [];
          const data = range ? all.slice(range[0], range[1] + 1) : all;
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as any;
}

describe('fetchLiveFeed', () => {
  const gameRow = {
    game_id: 'G1',
    home_team: 'BUF',
    away_team: 'KC',
    kickoff: '2026-11-22T18:00:00Z',
    state: 'in',
    elapsed_seconds: 900,
    length_seconds: 3600,
    finished: false,
    last_play_at: '2026-11-22T18:20:00Z',
  };

  it('maps the shared tables into a feed, paging past the 1000-row cap', async () => {
    const plays = Array.from({ length: 2500 }, (_, i) => ({
      game_id: 'G1',
      play_id: i + 1,
      play_at: '2026-11-22T18:00:00Z',
      elapsed_seconds: i,
      stats: i === 0 ? { '00-1': { rush_yd: 4 } } : null,
    }));
    const feed = await fetchLiveFeed(
      fakeClient({
        nfl_live_games: [gameRow],
        nfl_live_plays: plays,
        nfl_live_players: [{ gsis_id: '00-1', espn_id: '9', full_name: 'A Back', position: 'RB', team: 'KC' }],
        live_worm_state: [{ heartbeat_at: '2026-11-22T18:21:00Z' }],
      }),
      2026,
      12
    );
    expect(feed).not.toBeNull();
    expect(feed!.plays).toHaveLength(2500);
    expect(feed!.plays[0]).toEqual({ gameId: 'G1', playId: 1, playAt: '2026-11-22T18:00:00Z', elapsedSeconds: 0, stats: { '00-1': { rush_yd: 4 } } });
    expect(feed!.games[0]).toMatchObject({ gameId: 'G1', elapsedSeconds: 900, finished: false, state: 'in' });
    expect(feed!.players[0]).toEqual({ gsisId: '00-1', espnId: '9', fullName: 'A Back', position: 'RB', team: 'KC' });
    expect(feed!.heartbeatAt).toBe('2026-11-22T18:21:00Z');
  });

  it('has no feed for a week the loop hasn’t written yet', async () => {
    const feed = await fetchLiveFeed(fakeClient({ nfl_live_games: [] }), 2026, 13);
    expect(feed).toBeNull();
  });
});
