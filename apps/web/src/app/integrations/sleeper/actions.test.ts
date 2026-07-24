import { getMatchups, getCurrentSleeperLeagues } from './actions';
import { fetchJson } from '@roster-loom/core';

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
});
