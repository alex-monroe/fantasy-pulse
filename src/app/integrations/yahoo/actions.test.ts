import { getYahooAccessToken, getYahooPlayerScores } from './actions';
import { fetchJson } from '@/lib/fetch-json';
import { createClient } from '@/utils/supabase/server';
import { getCurrentNflWeek } from '@/app/actions';

jest.mock('@/lib/fetch-json', () => ({ fetchJson: jest.fn() }));
jest.mock('@/utils/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/utils/logger', () => ({ info: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('@/app/actions', () => ({ getCurrentNflWeek: jest.fn() }));

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
    (getCurrentNflWeek as jest.Mock).mockResolvedValue(1);
    process.env.YAHOO_CLIENT_ID = 'id';
    process.env.YAHOO_CLIENT_SECRET = 'secret';
    process.env.YAHOO_REDIRECT_URI = 'uri';
  });

  it('refreshes token successfully', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ data: { access_token: 'new', refresh_token: 'r', expires_in: 3600 } });
    const result = await getYahooAccessToken(1);
    expect(result).toEqual({ access_token: 'new' });
  });

  it('returns error when refresh fails', async () => {
    (fetchJson as jest.Mock).mockResolvedValue({ error: 'bad' });
    const result = await getYahooAccessToken(1);
    expect(result).toEqual({ error: 'Failed to refresh Yahoo token: bad' });
  });

  it('parses player points correctly', async () => {
    mockSupabase.from().single.mockResolvedValueOnce({
      data: {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      },
      error: null,
    });

    (fetchJson as jest.Mock).mockResolvedValue({
      data: {
        fantasy_content: {
          team: [
            null,
            {
              roster: {
                '0': {
                  players: {
                    '0': {
                      player: [
                        [
                          { player_key: 'p1' },
                          { player_id: 'p1' },
                          { name: { full: 'Yahoo Player 1' } },
                          { display_position: 'QB' },
                          { headshot: { url: '' } },
                          { position_type: 'O' },
                        ],
                      ],
                      player_points: { total: '15' },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    });

    const result = await getYahooPlayerScores(1, 'team');
    expect(result).toEqual({
      players: [
        {
          player_key: 'p1',
          player_id: 'p1',
          name: 'Yahoo Player 1',
          headshot: '',
          position_type: 'O',
          totalPoints: '15',
        },
      ],
    });
  });
});
