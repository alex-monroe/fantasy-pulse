import { fetchJson } from '@roster-loom/core';

describe('fetchJson', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn();
  });

  it('returns data when response is ok', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ a: 1 }) });
    const result = await fetchJson<{ a: number }>('/test');
    expect(fetch).toHaveBeenCalledWith('/test', { next: { revalidate: 3600 } });
    expect(result).toEqual({ data: { a: 1 } });
  });

  it('returns error when response is not ok', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: false, statusText: 'Bad', json: () => Promise.resolve({ message: 'fail' }) });
    const result = await fetchJson('/test');
    expect(result).toEqual({ error: 'fail' });
  });

  it('unwraps nested error objects like Yahoo returns', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: () =>
        Promise.resolve({
          error: { 'xml:lang': 'en-us', description: 'This application is not authorized to perform this action.' },
        }),
    });
    const result = await fetchJson('/test');
    expect(result).toEqual({
      error: 'This application is not authorized to perform this action.',
      status: 403,
    });
  });

  it('falls back to statusText when a nested error has no description', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: () => Promise.resolve({ error: { code: 1 } }),
    });
    const result = await fetchJson('/test');
    expect(result.error).toBe('Server Error');
  });

  it('disables caching when disableCache is true', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await fetchJson('/test', { disableCache: true });

    expect(fetch).toHaveBeenCalledWith('/test', {
      cache: 'no-store',
      next: { revalidate: 0 },
    });
  });

  it('does not override an existing revalidate value', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await fetchJson('/test', { next: { revalidate: 10 } });

    expect(fetch).toHaveBeenCalledWith('/test', { next: { revalidate: 10 } });
  });

  it('does not enable caching for non-GET requests', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

    await fetchJson('/test', { method: 'POST' });

    expect(fetch).toHaveBeenCalledWith('/test', { method: 'POST' });
  });
});
