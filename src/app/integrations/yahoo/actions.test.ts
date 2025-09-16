import playerScoresExample from './player-scores.example.json';
import { clearPlayerInfoCache } from '@/lib/cache';
let actions: typeof import('./actions');
let fetchJson: jest.Mock;
let createClient: jest.Mock;
const rosterExample = {
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
                    { player_key: 'p3' },
                    { player_id: 'p3' },
                    { name: { full: 'Yahoo Player 1' } },
                    { display_position: 'QB' },
                    { headshot: { url: '' } },
                    { editorial_team_abbr: 'KC' },
                  ],
                  { selected_position: [null, { position: 'QB' }] },
                ],
              },
            },
          },
        },
      },
    ],
  },
};

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

  beforeEach(async () => {
    clearPlayerInfoCache();
    jest.resetModules();
    process.env.YAHOO_CLIENT_ID = 'id';
    process.env.YAHOO_CLIENT_SECRET = 'secret';
    process.env.YAHOO_REDIRECT_URI = 'http://uri';

    fetchJson = (await import('@/lib/fetch-json')).fetchJson as jest.Mock;
    createClient = (await import('@/utils/supabase/server')).createClient as jest.Mock;
    actions = await import('./actions');

    createClient.mockReturnValue(mockSupabase);
    mockSupabase.from().single.mockResolvedValue({ data: { access_token: 'old', refresh_token: 'refresh', expires_at: new Date(Date.now() - 1000).toISOString() }, error: null });
    fetchJson.mockReset();
  });

  it('refreshes token successfully', async () => {
    fetchJson.mockResolvedValue({ data: { access_token: 'new', refresh_token: 'r', expires_in: 3600 } });
    const result = await actions.getYahooAccessToken(1);
    expect(result).toEqual({ access_token: 'new' });
  });

  it('returns error when refresh fails', async () => {
    fetchJson.mockResolvedValue({ error: 'bad' });
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

    fetchJson.mockResolvedValue({ data: playerScoresExample });
    const result = await actions.getYahooPlayerScores(1, 'teamKey');

    expect(result.players[0]).toMatchObject({
      player_key: '461.p.40896',
      name: 'Jayden Daniels',
      totalPoints: '19.70',
    });
  });

  it('parses roster correctly', async () => {
    // Return a non-expired token so getYahooAccessToken does not attempt to refresh
    mockSupabase.from().single.mockResolvedValueOnce({
      data: {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
      error: null,
    });

    fetchJson.mockResolvedValue({ data: rosterExample });
    const result = await actions.getYahooRoster(1, '123.l.456', '1');

    expect(result.players[0]).toMatchObject({
      player_key: 'p3',
      name: 'Yahoo Player 1',
      display_position: 'QB',
    });
  });

  it('uses cached roster data on subsequent calls', async () => {
    mockSupabase.from().single.mockClear();
    mockSupabase.from().single.mockResolvedValueOnce({
      data: {
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
      error: null,
    });

    fetchJson.mockResolvedValue({ data: rosterExample });

    const firstResult = await actions.getYahooRoster(1, '123.l.456', '1');
    expect(fetchJson).toHaveBeenCalledTimes(1);

    fetchJson.mockClear();

    const secondResult = await actions.getYahooRoster(1, '123.l.456', '1');
    expect(fetchJson).not.toHaveBeenCalled();
    expect(secondResult).toEqual(firstResult);
    expect(mockSupabase.from().single).toHaveBeenCalledTimes(1);
  });
});
