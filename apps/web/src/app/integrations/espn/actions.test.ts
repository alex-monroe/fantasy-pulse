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

function buildMockSupabase() {
  const integrationInsertSingle = jest.fn();
  const integrationSelectSingle = jest.fn();
  const leaguesUpsert = jest.fn();
  const teamsUpsert = jest.fn();
  const deleteEq = jest.fn().mockResolvedValue({ error: null });

  const tables: Record<string, any> = {
    fp_user_integrations: {
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ single: integrationInsertSingle }),
      }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({ single: integrationSelectSingle }),
      }),
      delete: jest.fn().mockReturnValue({ eq: deleteEq }),
    },
    fp_leagues: {
      upsert: leaguesUpsert,
      delete: jest.fn().mockReturnValue({ eq: deleteEq }),
    },
    fp_teams: {
      upsert: teamsUpsert,
      delete: jest.fn().mockReturnValue({ eq: deleteEq }),
    },
  };

  const mockSupabase = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn((table: string) => tables[table]),
  };

  return {
    mockSupabase,
    integrationInsertSingle,
    integrationSelectSingle,
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
      const { mockSupabase, integrationSelectSingle } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelectSingle.mockResolvedValue({
        data: { espn_s2: 's2-value', swid: '{USER-SWID-1234}' },
        error: null,
      });
      fetchJson.mockResolvedValue({ data: matchupPayload, status: 200 });

      const result = await actions.getEspnMatchup(42, '999', '1');

      expect(result.matchup).toEqual({
        week: 3,
        userTeam: { teamId: '1', name: 'My Team', logo_url: 'logo1.png', totalPoints: 101.5 },
        opponentTeam: {
          teamId: '2',
          name: 'Rival Team',
          logo_url: 'logo2.png',
          totalPoints: 88.25,
        },
      });
    });

    it('returns a reconnect error when the stored cookies are rejected', async () => {
      const { mockSupabase, integrationSelectSingle } = buildMockSupabase();
      createClient.mockReturnValue(mockSupabase);
      integrationSelectSingle.mockResolvedValue({
        data: { espn_s2: 'stale', swid: '{USER-SWID-1234}' },
        error: null,
      });
      fetchJson.mockResolvedValue({ error: 'Forbidden', status: 403 });

      const result = await actions.getEspnMatchup(42, '999', '1');

      expect(result.error).toMatch(/reconnect/i);
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
