import { getMatchups, getNflPlayers } from './actions';
import { fetchJson } from '@/lib/fetch-json';
import { clearPlayerInfoCache } from '@/lib/cache';

jest.mock('@/lib/fetch-json', () => ({ fetchJson: jest.fn() }));

describe('sleeper actions', () => {
  beforeEach(() => {
    (fetchJson as jest.Mock).mockReset();
    clearPlayerInfoCache();
  });

  it('returns matchups on success', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ data: [{ id: 1 }] });
    const result = await getMatchups('league', '1');
    expect(fetchJson).toHaveBeenCalledWith('https://api.sleeper.app/v1/league/league/matchups/1');
    expect(result).toEqual({ matchups: [{ id: 1 }] });
  });

  it('returns error on failure', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ error: 'fail' });
    const result = await getMatchups('league', '1');
    expect(result).toEqual({ error: 'fail' });
  });

  describe('getNflPlayers', () => {
    it('returns cached players when available', async () => {
      (fetchJson as jest.Mock).mockResolvedValueOnce({
        data: {
          '1': { first_name: 'Test' },
        },
      });

      const firstResult = await getNflPlayers();
      expect(fetchJson).toHaveBeenCalledTimes(1);
      expect(firstResult).toEqual({
        players: {
          '1': { first_name: 'Test' },
        },
      });

      (fetchJson as jest.Mock).mockClear();

      const secondResult = await getNflPlayers();
      expect(fetchJson).not.toHaveBeenCalled();
      expect(secondResult).toEqual(firstResult);
    });

    it('does not cache error responses', async () => {
      (fetchJson as jest.Mock).mockResolvedValueOnce({ error: 'fail' });

      const firstResult = await getNflPlayers();
      expect(firstResult).toEqual({ error: 'fail' });
      expect(fetchJson).toHaveBeenCalledTimes(1);

      (fetchJson as jest.Mock).mockResolvedValueOnce({
        data: {
          '2': { first_name: 'Another' },
        },
      });

      const secondResult = await getNflPlayers();
      expect(fetchJson).toHaveBeenCalledTimes(2);
      expect(secondResult).toEqual({
        players: {
          '2': { first_name: 'Another' },
        },
      });
    });
  });
});
