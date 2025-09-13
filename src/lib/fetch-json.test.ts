import { fetchJson } from './fetch-json';

describe('fetchJson', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock) = jest.fn();
  });

  it('returns data when response is ok', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: () => Promise.resolve({ a: 1 }) });
    const result = await fetchJson<{ a: number }>('/test');
    expect(result).toEqual({ data: { a: 1 } });
  });

  it('returns error when response is not ok', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: false, statusText: 'Bad', json: () => Promise.resolve({ message: 'fail' }) });
    const result = await fetchJson('/test');
    expect(result).toEqual({ error: 'fail' });
  });
});
