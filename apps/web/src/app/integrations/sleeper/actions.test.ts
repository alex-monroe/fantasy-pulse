import {
  getMatchups,
  getCurrentSleeperLeagues,
  getLeagueScoringSettings,
  getWeeklyProjections,
} from './actions';
import { fetchJson } from '@roster-loom/core';

function makeProjectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    player_id: '10871',
    team: 'DAL',
    opponent: 'PHI',
    week: 1,
    season: '2025',
    stats: { pass_yd: 200, rec: 3, rec_yd: 40 },
    player: { first_name: 'Luke', last_name: 'Schoonmaker', position: 'TE' },
    ...overrides,
  };
}

jest.mock('@roster-loom/core', () => ({ fetchJson: jest.fn() }));

describe('sleeper actions', () => {
  beforeEach(() => {
    (fetchJson as jest.Mock).mockReset();
  });

  describe('getCurrentSleeperLeagues', () => {
    it('fetches leagues for the current NFL season', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({
        data: [{ league_id: 'new-season-league' }],
      });
      const year = new Date().getFullYear();
      const result = await getCurrentSleeperLeagues('sleeper-user-1');
      expect(fetchJson).toHaveBeenCalledWith(
        `https://api.sleeper.app/v1/user/sleeper-user-1/leagues/nfl/${year}`
      );
      expect(result).toEqual({ leagues: [{ league_id: 'new-season-league' }] });
    });

    it('returns an empty list when the user has no leagues yet', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ data: null });
      const result = await getCurrentSleeperLeagues('sleeper-user-1');
      expect(result).toEqual({ leagues: [] });
    });

    it('returns error on failure', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ error: 'fail' });
      const result = await getCurrentSleeperLeagues('sleeper-user-1');
      expect(result).toEqual({ error: 'fail' });
    });
  });

  it('returns matchups on success', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ data: [{ id: 1 }] });
    const result = await getMatchups('league', '1');
    expect(fetchJson).toHaveBeenCalledWith(
      'https://api.sleeper.app/v1/league/league/matchups/1',
      { disableCache: true }
    );
    expect(result).toEqual({ matchups: [{ id: 1 }] });
  });

  it('returns error on failure', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ error: 'fail' });
    const result = await getMatchups('league', '1');
    expect(result).toEqual({ error: 'fail' });
  });

  describe('getLeagueScoringSettings', () => {
    it('returns the league scoring settings', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({
        data: { league_id: 'league', scoring_settings: { rec: 0.5, pass_td: 4 } },
      });
      const result = await getLeagueScoringSettings('league');
      expect(fetchJson).toHaveBeenCalledWith('https://api.sleeper.app/v1/league/league');
      expect(result).toEqual({ scoringSettings: { rec: 0.5, pass_td: 4 } });
    });

    it('defaults to an empty object when settings are missing', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ data: { league_id: 'league' } });
      const result = await getLeagueScoringSettings('league');
      expect(result).toEqual({ scoringSettings: {} });
    });

    it('returns error on failure', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ error: 'fail' });
      const result = await getLeagueScoringSettings('league');
      expect(result).toEqual({ error: 'fail' });
    });
  });

  describe('getWeeklyProjections', () => {
    it('fetches and returns validated projection rows', async () => {
      const rows = [makeProjectionRow()];
      (fetchJson as jest.Mock).mockResolvedValue({ data: rows });

      const result = await getWeeklyProjections('2025', 1, ['TE']);

      expect(fetchJson).toHaveBeenCalledWith(
        'https://api.sleeper.com/projections/nfl/2025/1?season_type=regular&position%5B%5D=TE'
      );
      expect(result).toEqual({ projections: rows });
    });

    it('treats an empty projections response as a schema failure', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ data: [] });
      const result = await getWeeklyProjections('2025', 1);
      expect(result.error).toMatch(/no rows/);
    });

    it('fails loudly when no row carries a recognised stat key', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({
        data: [makeProjectionRow({ stats: { some_new_stat: 1 } })],
      });
      const result = await getWeeklyProjections('2025', 1);
      expect(result.error).toMatch(/no expected stat keys/i);
    });

    it('bubbles up a fetch error', async () => {
      (fetchJson as jest.Mock).mockResolvedValue({ error: 'fail' });
      const result = await getWeeklyProjections('2025', 1);
      expect(result).toEqual({ error: 'fail' });
    });
  });
});
