import { getMatchups } from './actions';
import { fetchJson } from '@/lib/fetch-json';

jest.mock('@/lib/fetch-json', () => ({ fetchJson: jest.fn() }));
jest.mock('@/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));

describe('sleeper actions', () => {
  beforeEach(() => {
    (fetchJson as jest.Mock).mockReset();
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
});
