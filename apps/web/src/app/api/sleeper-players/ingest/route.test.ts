/**
 * @jest-environment node
 */
const ingestSleeperPlayers = jest.fn();
const invalidateSleeperPlayersCache = jest.fn();

jest.mock('@/lib/sleeper-players/pool', () => ({
  ingestSleeperPlayers: (...args: unknown[]) => ingestSleeperPlayers(...args),
}));
jest.mock('@/app/actions', () => ({
  invalidateSleeperPlayersCache: (...args: unknown[]) => invalidateSleeperPlayersCache(...args),
}));

import { GET, POST } from './route';

const SECRET = 'test-cron-secret';
const request = (headers: Record<string, string> = {}) =>
  new Request('https://example.com/api/sleeper-players/ingest', { headers });

beforeEach(() => {
  ingestSleeperPlayers.mockReset().mockResolvedValue({ playerCount: 12000 });
  invalidateSleeperPlayersCache.mockReset();
  process.env.CRON_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

describe('/api/sleeper-players/ingest', () => {
  it('is disabled without CRON_SECRET', async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(request())).status).toBe(503);
    expect(ingestSleeperPlayers).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong token', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ authorization: 'Bearer nope' }))).status).toBe(401);
    expect(ingestSleeperPlayers).not.toHaveBeenCalled();
  });

  it('ingests and drops the in-memory cache for an authorized caller', async () => {
    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ playerCount: 12000, ok: true });
    expect(invalidateSleeperPlayersCache).toHaveBeenCalled();
  });

  it('answers 502 and keeps the cache when the ingest fails', async () => {
    ingestSleeperPlayers.mockResolvedValue({ playerCount: 0, error: 'boom' });
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));
    expect(response.status).toBe(502);
    expect(invalidateSleeperPlayersCache).not.toHaveBeenCalled();
  });
});
