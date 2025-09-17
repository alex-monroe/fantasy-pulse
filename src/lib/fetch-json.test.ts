import { fetchJson } from './fetch-json';

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
