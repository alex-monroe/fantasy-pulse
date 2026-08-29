let actions: typeof import('./actions');
let fetchJson: jest.Mock;
let createClient: jest.Mock;

const leaguePayload = {
  seasonId: 2026,
  settings: { name: 'ESPN Test League' },
  status: { currentMatchupPeriod: 3 },
  teams: [
    { id: 1, name: 'My Team', logo: 'logo1.png', owners: ['{USER-SWID-1234}'] },
    { id: 2, name: 'Rival Team', logo: 'logo2.png', owners: ['{OTHER-SWID-5678}'] },
  ],
};

const matchupPayload = {
  status: { currentMatchupPeriod: 3 },
  teams: leaguePayload.teams,
  schedule: [
    {
      matchupPeriodId: 3,
      home: { teamId: 1, totalPoints: 101.5 },
      away: { teamId: 2, totalPoints: 88.25 },
    },
  ],
};

jest.mock('@roster-loom/core', () => ({ fetchJson: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));

// A chainable query-builder stub: every method returns itself so it
// supports any combination/order of .eq()/.order()/.limit(), and it's
// thenable so `await` works whether or not a terminal .single()/
// .maybeSingle() is called — matching how the Supabase client behaves and
// letting one stub cover connectEspn's dedup lookup, getEspnIntegration's
// most-recent-row lookup, and getEspnMatchup's credential lookup.
function makeEqChain(result: { data: any; error: any }) {
  const chain: any = {
    eq: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function buildMockSupabase() {
  const integrationInsertSingle = jest.fn();
  const integrationSelect = jest.fn().mockReturnValue(makeEqChain({ data: [], error: null }));
  const leaguesUpsert = jest.fn();
  const teamsUpsert = jest.fn();
  const deleteEq = jest.fn().mockResolvedValue({ error: null });

  const tables: Record<string, any> = {
    fp_user_integrations: {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ single: integrationInsertSingle }),
      }),
      select: integrationSelect,
      delete: jest.fn().mockReturnValue({ eq: deleteEq, in: deleteEq }),
    },
    fp_leagues: {
      upsert: leaguesUpsert,
      delete: jest.fn().mockReturnValue({ eq: deleteEq, in: deleteEq }),
    },
    fp_teams: {
      upsert: teamsUpsert,
      delete: jest.fn().mockReturnValue({ eq: deleteEq, in: deleteEq }),
    },
  };

  const mockSupabase = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn((table: string) => tables[table]),
  };

  return {
    mockSupabase,
    integrationInsertSingle,
    integrationSelect,
    leaguesUpsert,
    teamsUpsert,
    deleteEq,
  };
}

describe('espn actions', () => {
  beforeEach(async () => {
    jest.resetModules();
    fetchJson = (await import('@roster-loom/core')).fetchJson as jest.Mock;
    createClient = (await import('@/utils/supabase/server')).createClient as jest.Mock;
    actions = await import('./actions');
    fetchJson.mockReset();
  });

  describe('connectEspn', () => {
    it('connects the team owned by the given SWID', async () => {
      const { mockSupabase, integrationInsertSingle, leaguesUpsert, teamsUpsert } =
        buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      fetchJson.mockResolvedValue({ data: leaguePayload, status: 200 });
      integrationInsertSingle.mockResolvedValue({ data: { id: 42 }, error: null });
      leaguesUpsert.mockResolvedValue({ error: null });
      teamsUpsert.mockResolvedValue({ error: null });

      const result = await actions.connectEspn('999', 's2-value', '{USER-SWID-1234}');

      expect(result.error).toBeUndefined();
      expect(result.team).toEqual({ teamId: '1', name: 'My Team' });
      expect(mockSupabase.from).toHaveBeenCalledWith('fp_user_integrations');
      expect(leaguesUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ league_id: '999', user_integration_id: 42 }),
        { onConflict: 'league_id,user_integration_id' }
      );
      expect(teamsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ team_key: 'espn.999.1', team_id: '1' }),
        { onConflict: 'team_key,user_integration_id' }
      );
    });

    it('deletes any existing ESPN integration rows before creating a new one', async () => {
      const { mockSupabase, integrationSelect, integrationInsertSingle, leaguesUpsert, teamsUpsert, deleteEq } =
        buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(
        makeEqChain({ data: [{ id: 10 }, { id: 11 }], error: null })
      );
      fetchJson.mockResolvedValue({ data: leaguePayload, status: 200 });
      integrationInsertSingle.mockResolvedValue({ data: { id: 42 }, error: null });
      leaguesUpsert.mockResolvedValue({ error: null });
      teamsUpsert.mockResolvedValue({ error: null });

      const result = await actions.connectEspn('999', 's2-value', '{USER-SWID-1234}');

      expect(result.error).toBeUndefined();
      expect(deleteEq).toHaveBeenCalledWith('user_integration_id', [10, 11]);
      expect(deleteEq).toHaveBeenCalledWith('id', [10, 11]);
    });

    it('returns a reconnect error when ESPN rejects the cookies', async () => {
      const { mockSupabase } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      fetchJson.mockResolvedValue({ error: 'Unauthorized', status: 401 });

      const result = await actions.connectEspn('999', 'stale-s2', '{USER-SWID-1234}');

      expect(result.error).toMatch(/stale/i);
    });

    it('errors when no team in the league is owned by the given SWID', async () => {
      const { mockSupabase } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      fetchJson.mockResolvedValue({ data: leaguePayload, status: 200 });

      const result = await actions.connectEspn('999', 's2-value', '{NOBODY}');

      expect(result.error).toMatch(/could not find a team/i);
    });

    it('requires the user to be logged in', async () => {
      const { mockSupabase } = buildMockSupabase();
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      createClient.mockReturnValue(mockSupabase);

      const result = await actions.connectEspn('999', 's2-value', '{USER-SWID-1234}');

      expect(result.error).toMatch(/logged in/i);
    });
  });

  describe('getEspnMatchup', () => {
    it('returns team-level totals for the current matchup period', async () => {
      const { mockSupabase, integrationSelect } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(
        makeEqChain({ data: { espn_s2: 's2-value', swid: '{USER-SWID-1234}' }, error: null })
      );
      fetchJson.mockResolvedValue({ data: matchupPayload, status: 200 });

      const result = await actions.getEspnMatchup(42, '999', '1');

      expect(result.matchup).toEqual({
        week: 3,
        userTeam: {
          teamId: '1',
          name: 'My Team',
          logo_url: 'logo1.png',
          totalPoints: 101.5,
          players: [],
        },
        opponentTeam: {
          teamId: '2',
          name: 'Rival Team',
          logo_url: 'logo2.png',
          totalPoints: 88.25,
          players: [],
        },
      });
    });

    it('maps roster entries into player-level detail', async () => {
      const { mockSupabase, integrationSelect } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(
        makeEqChain({ data: { espn_s2: 's2-value', swid: '{USER-SWID-1234}' }, error: null })
      );
      fetchJson.mockResolvedValue({
        data: {
          ...matchupPayload,
          schedule: [
            {
              matchupPeriodId: 3,
              home: {
                teamId: 1,
                totalPoints: 101.5,
                rosterForCurrentScoringPeriod: {
                  entries: [
                    {
                      lineupSlotId: 0,
                      playerPoolEntry: {
                        appliedStatTotal: 24.5,
                        player: {
                          id: 111,
                          fullName: 'Star Quarterback',
                          defaultPositionId: 0,
                          proTeamId: 12,
                        },
                      },
                    },
                    {
                      lineupSlotId: 20,
                      playerPoolEntry: {
                        appliedStatTotal: 0,
                        player: {
                          id: 222,
                          fullName: 'Bench Guy',
                          defaultPositionId: 4,
                          proTeamId: 25,
                        },
                      },
                    },
                  ],
                },
              },
              away: { teamId: 2, totalPoints: 88.25 },
            },
          ],
        },
        status: 200,
      });

      const result = await actions.getEspnMatchup(42, '999', '1');

      expect(result.matchup?.userTeam.players).toEqual([
        { id: '111', name: 'Star Quarterback', position: 'QB', realTeam: 'KC', points: 24.5, onBench: false },
        { id: '222', name: 'Bench Guy', position: 'WR', realTeam: 'SF', points: 0, onBench: true },
      ]);
      expect(result.matchup?.opponentTeam.players).toEqual([]);
    });

    it('falls back to the static team roster when no live scoring-period roster exists', async () => {
      const { mockSupabase, integrationSelect } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(
        makeEqChain({ data: { espn_s2: 's2-value', swid: '{USER-SWID-1234}' }, error: null })
      );
      fetchJson.mockResolvedValue({
        data: {
          status: { currentMatchupPeriod: 3 },
          teams: [
            {
              id: 1,
              name: 'My Team',
              logo: 'logo1.png',
              owners: ['{USER-SWID-1234}'],
              roster: {
                entries: [
                  {
                    lineupSlotId: 0,
                    playerPoolEntry: {
                      appliedStatTotal: 0,
                      player: {
                        id: 111,
                        fullName: 'Preseason QB',
                        defaultPositionId: 0,
                        proTeamId: 12,
                      },
                    },
                  },
                ],
              },
            },
            { id: 2, name: 'Rival Team', logo: 'logo2.png', owners: ['{OTHER-SWID-5678}'] },
          ],
          schedule: [
            {
              matchupPeriodId: 3,
              home: { teamId: 1, totalPoints: 0 },
              away: { teamId: 2, totalPoints: 0 },
            },
          ],
        },
        status: 200,
      });

      const result = await actions.getEspnMatchup(42, '999', '1');

      expect(result.matchup?.userTeam.players).toEqual([
        { id: '111', name: 'Preseason QB', position: 'QB', realTeam: 'KC', points: 0, onBench: false },
      ]);
    });

    it('returns a reconnect error when the stored cookies are rejected', async () => {
      const { mockSupabase, integrationSelect } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(
        makeEqChain({ data: { espn_s2: 'stale', swid: '{USER-SWID-1234}' }, error: null })
      );
      fetchJson.mockResolvedValue({ error: 'Forbidden', status: 403 });

      const result = await actions.getEspnMatchup(42, '999', '1');

      expect(result.error).toMatch(/reconnect/i);
    });
  });

  describe('getEspnIntegration', () => {
    it('returns the most recent integration when duplicate rows exist', async () => {
      const { mockSupabase, integrationSelect } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(
        makeEqChain({ data: { id: 11, provider: 'espn' }, error: null })
      );

      const result = await actions.getEspnIntegration();

      expect(result.error).toBeUndefined();
      expect(result.integration).toEqual({ id: 11, provider: 'espn' });
    });

    it('returns a null integration when none exists', async () => {
      const { mockSupabase, integrationSelect } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelect.mockReturnValue(makeEqChain({ data: null, error: null }));

      const result = await actions.getEspnIntegration();

      expect(result.error).toBeUndefined();
      expect(result.integration).toBeNull();
    });
  });

  describe('removeEspnIntegration', () => {
    it('deletes teams, leagues, and the integration', async () => {
      const { mockSupabase, deleteEq } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);

      const result = await actions.removeEspnIntegration(42);

      expect(result).toEqual({ success: true });
      expect(deleteEq).toHaveBeenCalledTimes(3);
    });
  });
});
