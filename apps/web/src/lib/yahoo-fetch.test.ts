jest.mock('@roster-loom/core', () => ({ fetchJson: jest.fn() }));

import { fetchJson } from '@roster-loom/core';
import { yahooGet } from './yahoo-fetch';

const mockFetchJson = fetchJson as jest.Mock;

describe('yahooGet', () => {
  beforeEach(() => mockFetchJson.mockReset());

  it('never lets the response into the data cache', async () => {
    mockFetchJson.mockResolvedValue({ data: { ok: true }, status: 200 });
    await yahooGet('https://example.test/x', 'tok');
    expect(mockFetchJson).toHaveBeenCalledWith('https://example.test/x', {
      headers: { Authorization: 'Bearer tok', Accept: 'application/json' },
      disableCache: true,
    });
  });

  it('retries throttled responses with exponential backoff', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    mockFetchJson
      .mockResolvedValueOnce({ error: 'slow down', status: 429 })
      .mockResolvedValueOnce({ error: 'slow down', status: 999 })
      .mockResolvedValueOnce({ data: { ok: true }, status: 200 });

    const result = await yahooGet('u', 't', { sleep, baseDelayMs: 100 });

    expect(result.data).toEqual({ ok: true });
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it('gives up after maxAttempts and returns the last error', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    mockFetchJson.mockResolvedValue({ error: 'slow down', status: 429 });

    const result = await yahooGet('u', 't', { sleep, maxAttempts: 2 });

    expect(result).toEqual({ error: 'slow down', status: 429 });
    expect(mockFetchJson).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-throttling errors', async () => {
    const sleep = jest.fn();
    mockFetchJson.mockResolvedValue({ error: 'expired', status: 401 });

    const result = await yahooGet('u', 't', { sleep });

    expect(result.status).toBe(401);
    expect(mockFetchJson).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
