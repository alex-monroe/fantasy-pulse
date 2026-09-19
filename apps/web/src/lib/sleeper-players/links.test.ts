import { buildSleeperPlayerLinks, syncSleeperPlayerLinks } from './links';

const sleeper = {
  '100': { full_name: 'Justin Jefferson', position: 'WR', team: 'MIN', active: true },
  '200': { full_name: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI', active: true },
  // Two Sleeper records for one name: only the active one should win.
  '300': { full_name: 'Mike Williams', position: 'WR', team: 'PIT', active: true },
  '301': { full_name: 'Mike Williams', position: 'WR', team: null, active: false },
  // Two active namesakes: ambiguous.
  '400': { full_name: 'Josh Allen', position: 'QB', team: 'BUF', active: true },
  '401': { full_name: 'Josh Allen', position: 'QB', team: 'FA', active: true },
  // Same name, different position: must not link across positions.
  '500': { full_name: 'Josh Allen', position: 'LB', team: 'JAX', active: true },
  // Defenses and IDP have no players row.
  SEA: { full_name: 'Seattle Seahawks', position: 'DEF', team: 'SEA', active: true },
};

const row = (id: string, name: string, position: string) => ({ id, name, position });

describe('buildSleeperPlayerLinks', () => {
  it('links a unique name+position, ignoring suffixes and punctuation', () => {
    const links = buildSleeperPlayerLinks(
      [row('p1', 'Justin Jefferson', 'WR'), row('p2', 'Marvin Harrison', 'WR')],
      sleeper
    );
    expect(links).toEqual([
      { sleeper_id: '100', player_id: 'p1', match_method: 'name_position' },
      { sleeper_id: '200', player_id: 'p2', match_method: 'name_position' },
    ]);
  });

  it('breaks a tie only when exactly one candidate is active on a team', () => {
    const links = buildSleeperPlayerLinks([row('p3', 'Mike Williams', 'WR')], sleeper);
    expect(links).toEqual([
      { sleeper_id: '300', player_id: 'p3', match_method: 'name_position_active' },
    ]);
  });

  it('skips ambiguous names and does not cross positions', () => {
    expect(buildSleeperPlayerLinks([row('p4', 'Josh Allen', 'QB')], sleeper)).toEqual([]);
    expect(buildSleeperPlayerLinks([row('p5', 'Josh Allen', 'LB')], sleeper)).toEqual([]);
  });

  it('links nobody when two rows claim the same Sleeper id', () => {
    const links = buildSleeperPlayerLinks(
      [row('a', 'Justin Jefferson', 'WR'), row('b', 'Justin Jefferson', 'WR')],
      sleeper
    );
    expect(links).toEqual([]);
  });

  it('skips defenses, unknown names and unlinkable positions', () => {
    expect(
      buildSleeperPlayerLinks([row('d', 'Seattle Seahawks', 'DEF'), row('x', 'Nobody Here', 'RB')], sleeper)
    ).toEqual([]);
  });
});

describe('syncSleeperPlayerLinks', () => {
  const makeClient = (playerPages: unknown[][]) => {
    const calls: string[] = [];
    let page = 0;
    const playersQuery: any = {
      select: () => playersQuery,
      gt: () => playersQuery,
      eq: () => playersQuery,
      order: () => playersQuery,
      range: async () => ({ data: playerPages[page++] ?? [], error: null }),
    };
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const lt = jest.fn().mockResolvedValue({ error: null });
    const client: any = {
      from: (table: string) => {
        calls.push(table);
        if (table === 'players') return playersQuery;
        return { upsert, delete: () => ({ lt }) };
      },
    };
    return { client, upsert, lt, calls };
  };

  it('upserts this run\'s links, then prunes older ones', async () => {
    const { client, upsert, lt } = makeClient([[row('p1', 'Justin Jefferson', 'WR')]]);

    const count = await syncSleeperPlayerLinks(client, sleeper);

    expect(count).toBe(1);
    const [rows, options] = upsert.mock.calls[0];
    expect(rows).toEqual([
      expect.objectContaining({ sleeper_id: '100', player_id: 'p1', linked_at: expect.any(String) }),
    ]);
    expect(options).toEqual({ onConflict: 'sleeper_id' });
    expect(lt).toHaveBeenCalledWith('linked_at', rows[0].linked_at);
  });

  it('pages through more than 1000 players', async () => {
    const full = Array.from({ length: 1000 }, (_, i) => row(`p${i}`, `Nobody ${i}`, 'WR'));
    const { client, calls } = makeClient([full, [row('last', 'Justin Jefferson', 'WR')]]);

    expect(await syncSleeperPlayerLinks(client, sleeper)).toBe(1);
    expect(calls.filter((table) => table === 'players')).toHaveLength(2);
  });
});
