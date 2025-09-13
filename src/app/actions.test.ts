import { getTeams } from './actions';
import { createClient } from '@/utils/supabase/server';
import { getProvider } from '@/lib/integrations';

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/integrations');

global.fetch = jest.fn();

describe('actions', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn(),
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (fetch as jest.Mock).mockClear();
    jest.clearAllMocks();

    (getProvider as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('getTeams', () => {
    const mockPlayersData = {
      '1': { full_name: 'Player One', position: 'QB', team: 'TEAMA' },
      '2': { full_name: 'Player Two', position: 'WR', team: 'TEAMB' },
      'player one': { full_name: 'Player One', position: 'QB', team: 'TEAMA' },
    };

    const mockRosters = [
      { owner_id: 'sleeper-user-1', roster_id: 1, players: ['1'], starters: ['1'] },
      { owner_id: 'sleeper-user-2', roster_id: 2, players: ['2'], starters: ['2'] },
    ];

    const mockMatchups = [
      { roster_id: 1, matchup_id: 1, points: 100, players_points: { '1': 20 } },
      { roster_id: 2, matchup_id: 1, points: 90, players_points: { '2': 15 } },
    ];

    const mockLeagueUsers = [
      { user_id: 'sleeper-user-1', display_name: 'User A', metadata: { team_name: 'Team A' } },
      { user_id: 'sleeper-user-2', display_name: 'User B', metadata: { team_name: 'Team B' } },
    ];

    it('should return an error if user is not logged in', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
      const result = await getTeams();
      expect(result).toEqual({ error: 'You must be logged in.' });
    });

    it('should return an error if fetching integrations fails', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({ error: { message: 'Integrations fetch error' } });
      const result = await getTeams();
      expect(result).toEqual({ error: 'Integrations fetch error' });
    });

    it('should fetch and process sleeper teams correctly', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-1', provider: 'sleeper', provider_user_id: 'sleeper-user-1' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) }) // nflStateResponse
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) }) // playersResponse
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockRosters) }) // rostersResponse
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockMatchups) }) // matchupsResponse
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockLeagueUsers) }); // leagueUsersResponse

      const mockProvider = {
        getTeams: jest.fn().mockResolvedValue({
          teams: [{ id: 'team-1', name: 'Team A' }],
          error: null,
        }),
      };
      (getProvider as jest.Mock).mockReturnValue(mockProvider);

      (fetch as jest.Mock).mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) });

      const result = await getTeams();

      expect(result.teams).toBeDefined();
      expect(result.teams.length).toBe(1);
      expect(result.teams[0].name).toBe('Team A');
      expect(mockProvider.getTeams).toHaveBeenCalledWith(expect.any(Object), 1);
    });
  });
});
