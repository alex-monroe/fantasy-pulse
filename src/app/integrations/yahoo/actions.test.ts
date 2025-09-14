import * as actions from './actions';
import { fetchJson } from '@/lib/fetch-json';
import { createClient } from '@/utils/supabase/server';
import playerScoresExample from './player-scores.example.json';

jest.mock('@/lib/fetch-json', () => ({ fetchJson: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('@/app/actions', () => ({ getCurrentNflWeek: jest.fn().mockResolvedValue(2) }));

describe('yahoo actions', () => {
  const eqChain = jest.fn().mockReturnThis();
  const eqUpdate = jest.fn().mockResolvedValue({ error: null });
  const mockSupabase = {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user' } } }) },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: eqChain,
      single: jest.fn(),
      update: jest.fn().mockReturnValue({ eq: eqUpdate }),
    }),
  } as any;

  beforeEach(() => {
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    mockSupabase.from().single.mockResolvedValue({ data: { access_token: 'old', refresh_token: 'refresh', expires_at: new Date(Date.now() - 1000).toISOString() }, error: null });
    (fetchJson as jest.Mock).mockReset();
    process.env.YAHOO_CLIENT_ID = 'id';
    process.env.YAHOO_CLIENT_SECRET = 'secret';
    process.env.YAHOO_REDIRECT_URI = 'uri';
  });

  it('refreshes token successfully', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ data: { access_token: 'new', refresh_token: 'r', expires_in: 3600 } });
    const result = await actions.getYahooAccessToken(1);
    expect(result).toEqual({ access_token: 'new' });
  });

  it('returns error when refresh fails', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ error: 'bad' });
    const result = await actions.getYahooAccessToken(1);
    expect(result).toEqual({ error: 'Failed to refresh Yahoo token: bad' });
  });

  it('parses player scores correctly', async () => {
    // Return a non-expired token so getYahooAccessToken does not attempt to refresh
    mockSupabase.from().single.mockResolvedValueOnce({
      data: {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
      error: null,
    });

    (fetchJson as jest.Mock).mockResolvedValue({ data: playerScoresExample });
    const result = await actions.getYahooPlayerScores(1, 'teamKey');

    expect(result.players[0]).toMatchObject({
      player_key: '461.p.40896',
      name: 'Jayden Daniels',
      totalPoints: '19.70',
    });
  });
});
