import { getTeams, buildSleeperTeams, buildYahooTeams } from './actions';
import { createClient } from '@/utils/supabase/server';
import { getLeagues } from '@/app/integrations/sleeper/actions';
import {
  getYahooUserTeams,
  getYahooRoster,
  getYahooMatchups,
  getYahooPlayerScores,
} from '@/app/integrations/yahoo/actions';
import {
  getLeagues as getOttoneuLeagues,
  getOttoneuTeamInfo,
} from '@/app/integrations/ottoneu/actions';

jest.mock('@/utils/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/app/integrations/sleeper/actions', () => ({
  getLeagues: jest.fn(),
}));

jest.mock('@/app/integrations/yahoo/actions', () => ({
  getYahooUserTeams: jest.fn(),
  getYahooRoster: jest.fn(),
  getYahooMatchups: jest.fn(),
  getYahooPlayerScores: jest.fn(),
}));

jest.mock('@/app/integrations/ottoneu/actions', () => ({
  getLeagues: jest.fn(),
  getOttoneuTeamInfo: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));

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

    (getLeagues as jest.Mock).mockClear();
    (getYahooUserTeams as jest.Mock).mockClear();
    (getYahooRoster as jest.Mock).mockClear();
    (getYahooMatchups as jest.Mock).mockClear();
    (getYahooPlayerScores as jest.Mock).mockClear();
    (getOttoneuLeagues as jest.Mock).mockClear();
    (getOttoneuTeamInfo as jest.Mock).mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('buildSleeperTeams', () => {
    const mockPlayersData = {
      '1': { full_name: 'Player One', position: 'QB', team: 'TEAMA' },
      '2': { full_name: 'Player Two', position: 'WR', team: 'TEAMB' },
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

    it('returns empty array when getLeagues fails', async () => {
      (getLeagues as jest.Mock).mockResolvedValue({ leagues: null, error: 'err' });
      const result = await buildSleeperTeams(
        { id: 'int-1', provider_user_id: 'sleeper-user-1' },
        1,
        mockPlayersData
      );
      expect(result).toEqual([]);
    });

    it('builds sleeper teams correctly', async () => {
      (getLeagues as jest.Mock).mockResolvedValue({
        leagues: [{ id: 'league-1', league_id: 'sleeper-league-1' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockRosters) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockMatchups) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockLeagueUsers) });

      const result = await buildSleeperTeams(
        { id: 'int-1', provider_user_id: 'sleeper-user-1' },
        1,
        mockPlayersData
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Team A');
    });
  });

  describe('buildYahooTeams', () => {
    const playerNameMap = { 'player one': '1' };

    it('returns empty array when getYahooUserTeams fails', async () => {
      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: null,
        error: 'err',
      });
      const result = await buildYahooTeams({ id: 'int-2' }, playerNameMap);
      expect(result).toEqual([]);
    });

    it('builds yahoo teams correctly', async () => {
      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: [{ id: 'team-1', team_key: 'yahoo-team-1', league_id: 'yahoo-league-1' }],
        error: null,
      });

      (getYahooMatchups as jest.Mock).mockResolvedValue({
        matchups: {
          userTeam: {
            team_id: 'user-team-id',
            name: 'Yahoo User Team',
            totalPoints: '120',
            team_key: 'user-team-key',
          },
          opponentTeam: {
            team_id: 'opp-team-id',
            name: 'Yahoo Opponent Team',
            totalPoints: '110',
            team_key: 'opp-team-key',
          },
        },
        error: null,
      });

      (getYahooRoster as jest.Mock)
        .mockResolvedValueOnce({
          players: [
            {
              player_key: 'p1',
              name: 'Player One',
              display_position: 'QB',
              editorial_team_abbr: 'TEAMC',
              on_bench: false,
              headshot: 'img1',
            },
          ],
          error: null,
        })
        .mockResolvedValueOnce({
          players: [
            {
              player_key: 'p2',
              name: 'Player Two',
              display_position: 'WR',
              editorial_team_abbr: 'TEAMD',
              on_bench: false,
              headshot: 'img2',
            },
          ],
          error: null,
        });

      (getYahooPlayerScores as jest.Mock)
        .mockResolvedValueOnce({
          players: [{ player_key: 'p1', totalPoints: 25 }],
          error: null,
        })
        .mockResolvedValueOnce({
          players: [{ player_key: 'p2', totalPoints: 15 }],
          error: null,
        });

      const result = await buildYahooTeams({ id: 'int-2' }, playerNameMap);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Yahoo User Team');
      expect(result[0].players[0].imageUrl).toBe(
        'https://sleepercdn.com/content/nfl/players/thumb/1.jpg'
      );
    });
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

      (getLeagues as jest.Mock).mockResolvedValue({
        leagues: [{ id: 'league-1', league_id: 'sleeper-league-1' }],
        error: null,
      });

      const result = await getTeams();

      expect(result.teams).toBeDefined();
      expect(result.teams.length).toBe(1);
      expect(result.teams[0].name).toBe('Team A');
    });

    it('should fetch and process yahoo teams correctly', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-2', provider: 'yahoo' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) }) // nflStateResponse
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) }); // playersResponse

      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: [{ id: 'team-1', team_key: 'yahoo-team-1', league_id: 'yahoo-league-1' }],
        error: null,
      });

      (getYahooMatchups as jest.Mock).mockResolvedValue({
        matchups: {
          userTeam: { team_id: 'user-team-id', name: 'Yahoo User Team', totalPoints: '120' },
          opponentTeam: { team_id: 'opp-team-id', name: 'Yahoo Opponent Team', totalPoints: '110' },
        },
        error: null,
      });

      (getYahooRoster as jest.Mock)
        .mockResolvedValue({
          players: [{ player_key: 'p1', name: 'Player One', display_position: 'QB', editorial_team_abbr: 'TEAMC', on_bench: false }],
          error: null,
        });


      (getYahooPlayerScores as jest.Mock)
        .mockResolvedValue({
          players: [{ player_key: 'p1', totalPoints: 25 }],
          error: null,
        });

      const result = await getTeams();

      expect(result.teams).toBeDefined();
      expect(result.teams.length).toBe(1);
      expect(result.teams[0].name).toBe('Yahoo User Team');
      expect(result.teams[0].totalScore).toBe(120);
    });

    it('should continue if getLeagues returns an error', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-1', provider: 'sleeper', provider_user_id: 'sleeper-user-1' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) });

      (getLeagues as jest.Mock).mockResolvedValue({
        leagues: null,
        error: 'Failed to fetch leagues',
      });

      const result = await getTeams();
      expect(result.teams).toEqual([]);
    });

    it('should continue if getYahooUserTeams returns an error', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-2', provider: 'yahoo' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) });

      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: null,
        error: 'Failed to fetch yahoo teams',
      });

      const result = await getTeams();
      expect(result.teams).toEqual([]);
    });

    it('should continue if getYahooMatchups returns an error', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-2', provider: 'yahoo' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) });

      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: [{ id: 'team-1', team_key: 'yahoo-team-1', league_id: 'yahoo-league-1' }],
        error: null,
      });

      (getYahooMatchups as jest.Mock).mockResolvedValue({
        matchups: null,
        error: 'Failed to fetch yahoo matchups',
      });

      const result = await getTeams();
      expect(result.teams).toEqual([]);
    });

    it('should log an error if getYahooPlayerScores for user fails', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-2', provider: 'yahoo' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) });

      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: [{ id: 'team-1', team_key: 'yahoo-team-1', league_id: 'yahoo-league-1' }],
        error: null,
      });

      (getYahooMatchups as jest.Mock).mockResolvedValue({
        matchups: {
          userTeam: { team_id: 'user-team-id', name: 'Yahoo User Team', totalPoints: '120', team_key: 'user-team-key' },
          opponentTeam: { team_id: 'opp-team-id', name: 'Yahoo Opponent Team', totalPoints: '110', team_key: 'opp-team-key' },
        },
        error: null,
      });

      (getYahooRoster as jest.Mock).mockResolvedValue({
        players: [{ player_key: 'p1', name: 'Player One', display_position: 'QB', editorial_team_abbr: 'TEAMC', on_bench: false }],
        error: null,
      });

      (getYahooPlayerScores as jest.Mock)
        .mockResolvedValueOnce({
          players: null,
          error: 'User scores fetch error',
        })
        .mockResolvedValueOnce({
          players: [{ player_key: 'p1', totalPoints: 25 }],
          error: null,
        });

      await getTeams();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Could not fetch user player scores for team user-team-key',
        'User scores fetch error'
      );
    });

    it('should log an error if getYahooPlayerScores for opponent fails', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-2', provider: 'yahoo' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve(mockPlayersData) });

      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: [{ id: 'team-1', team_key: 'yahoo-team-1', league_id: 'yahoo-league-1' }],
        error: null,
      });

      (getYahooMatchups as jest.Mock).mockResolvedValue({
        matchups: {
          userTeam: { team_id: 'user-team-id', name: 'Yahoo User Team', totalPoints: '120', team_key: 'user-team-key' },
          opponentTeam: { team_id: 'opp-team-id', name: 'Yahoo Opponent Team', totalPoints: '110', team_key: 'opp-team-key' },
        },
        error: null,
      });

      (getYahooRoster as jest.Mock).mockResolvedValue({
        players: [{ player_key: 'p1', name: 'Player One', display_position: 'QB', editorial_team_abbr: 'TEAMC', on_bench: false }],
        error: null,
      });

      (getYahooPlayerScores as jest.Mock)
        .mockResolvedValueOnce({
          players: [{ player_key: 'p1', totalPoints: 25 }],
          error: null,
        })
        .mockResolvedValueOnce({
          players: null,
          error: 'Opponent scores fetch error',
        });

      await getTeams();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Could not fetch opponent player scores for team opp-team-key',
        'Opponent scores fetch error'
      );
    });

    it('should map yahoo players to sleeper players with fuzzy name matching', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [{ id: 'int-2', provider: 'yahoo' }],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({
          json: () =>
            Promise.resolve({
              '1': { full_name: 'Player One', position: 'QB', team: 'TEAMA' },
            }),
        });

      (getYahooUserTeams as jest.Mock).mockResolvedValue({
        teams: [{ id: 'team-1', team_key: 'yahoo-team-1', league_id: 'yahoo-league-1' }],
        error: null,
      });

      (getYahooMatchups as jest.Mock).mockResolvedValue({
        matchups: {
          userTeam: { team_id: 'user-team-id', name: 'Yahoo User Team', totalPoints: '120' },
          opponentTeam: { team_id: 'opp-team-id', name: 'Yahoo Opponent Team', totalPoints: '110' },
        },
        error: null,
      });

      (getYahooRoster as jest.Mock).mockResolvedValue({
        players: [
          { player_key: 'p1', name: 'Player 1', display_position: 'QB', editorial_team_abbr: 'TEAMC', on_bench: false },
        ],
        error: null,
      });

      (getYahooPlayerScores as jest.Mock).mockResolvedValue({
        players: [{ player_key: 'p1', totalPoints: 25 }],
        error: null,
      });

      const result = await getTeams();

      expect(result.teams[0].players[0].imageUrl).toBe('https://sleepercdn.com/content/nfl/players/thumb/1.jpg');
    });
  });

  describe('getTeams with Ottoneu integration', () => {
    it('builds teams from Ottoneu', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
      mockSupabase.eq.mockResolvedValue({
        data: [
          { id: 1, provider: 'ottoneu', provider_user_id: '2514' },
        ],
        error: null,
      });

      (fetch as jest.Mock)
        .mockResolvedValueOnce({ json: () => Promise.resolve({ week: 1 }) })
        .mockResolvedValueOnce({ json: () => Promise.resolve({}) });

      (getOttoneuLeagues as jest.Mock).mockResolvedValue({
        leagues: [{ league_id: '309' }],
        error: null,
      });

      (getOttoneuTeamInfo as jest.Mock).mockResolvedValue({
        teamName: 'My Team',
        teamId: '2514',
        matchup: {
          opponentName: 'Opponent',
          teamScore: 10,
          opponentScore: 20,
        },
      });

      const result = await getTeams();
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0]).toMatchObject({
        name: 'My Team',
        totalScore: 10,
        opponent: { name: 'Opponent', totalScore: 20 },
      });
    });
  });
});
