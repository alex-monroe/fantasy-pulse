/**
 * @jest-environment node
 */
const ingestNews = jest.fn();

jest.mock('@/lib/news/ingest', () => ({
  ingestNews: (...args: unknown[]) => ingestNews(...args),
}));

import { GET, POST } from './route';

const SECRET = 'test-cron-secret';

function request(headers: Record<string, string> = {}) {
  return new Request('https://example.com/api/news/ingest', { headers });
}

beforeEach(() => {
  ingestNews.mockReset().mockResolvedValue({
    source: 'rotowire',
    itemCount: 12,
    newItemCount: 3,
    skipped: false,
  });
  process.env.CRON_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

describe('GET /api/news/ingest', () => {
  it('ingests when the caller presents the cron secret', async () => {
    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      itemCount: 12,
      newItemCount: 3,
    });
    expect(ingestNews).toHaveBeenCalledWith({ force: true });
  });

  it('rejects a caller with no credentials', async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(ingestNews).not.toHaveBeenCalled();
  });

  it('rejects a caller with the wrong secret', async () => {
    const response = await GET(request({ authorization: 'Bearer nope' }));

    expect(response.status).toBe(401);
    expect(ingestNews).not.toHaveBeenCalled();
  });

  it('is disabled rather than open when no secret is configured', async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request({ authorization: 'Bearer anything' }));

    expect(response.status).toBe(503);
    expect(ingestNews).not.toHaveBeenCalled();
  });

  it('reports an ingest failure as a bad gateway', async () => {
    ingestNews.mockResolvedValue({
      source: 'rotowire',
      itemCount: 0,
      newItemCount: 0,
      skipped: false,
      error: 'feed down',
    });

    const response = await GET(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'feed down' });
  });
});

describe('POST /api/news/ingest', () => {
  it('behaves the same as GET, for manual triggering', async () => {
    const response = await POST(request({ authorization: `Bearer ${SECRET}` }));

    expect(response.status).toBe(200);
    expect(ingestNews).toHaveBeenCalledWith({ force: true });
  });
});
