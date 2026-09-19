import { createCoalescingCache } from './teams-cache';

describe('createCoalescingCache', () => {
  let clock = 0;
  const make = (overrides = {}) =>
    createCoalescingCache<{ teams: number[] }>({
      ttlMs: 1000,
      maxEntries: 2,
      now: () => clock,
      ...overrides,
    });

  beforeEach(() => {
    clock = 0;
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const cache = make();
    const load = jest.fn().mockResolvedValue({ teams: [1] });

    const [a, b] = await Promise.all([cache.get('u', load), cache.get('u', load)]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('serves a settled value until the TTL lapses, then reloads', async () => {
    const cache = make();
    const load = jest.fn().mockResolvedValue({ teams: [1] });

    await cache.get('u', load);
    clock = 999;
    await cache.get('u', load);
    expect(load).toHaveBeenCalledTimes(1);

    clock = 1000;
    await cache.get('u', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('lets a fresh caller bypass a settled value but join an in-flight load', async () => {
    const cache = make();
    const load = jest.fn().mockResolvedValue({ teams: [1] });

    await cache.get('u', load);
    await cache.get('u', load, { fresh: true });
    expect(load).toHaveBeenCalledTimes(2);

    const pending = cache.get('u2', load, { fresh: true });
    await cache.get('u2', load, { fresh: true });
    await pending;
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not cache failures', async () => {
    const cache = make();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ teams: [1] });

    await expect(cache.get('u', load)).rejects.toThrow('boom');
    await expect(cache.get('u', load)).resolves.toEqual({ teams: [1] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not keep values rejected by shouldCache', async () => {
    const cache = make({ shouldCache: (v: { teams: number[] }) => v.teams.length > 0 });
    const load = jest.fn().mockResolvedValue({ teams: [] });

    await cache.get('u', load);
    await cache.get('u', load);

    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.size()).toBe(0);
  });

  it('keeps users separate and evicts the oldest entry at capacity', async () => {
    const cache = make();
    const load = jest.fn().mockResolvedValue({ teams: [1] });

    await cache.get('a', load);
    await cache.get('b', load);
    await cache.get('c', load);

    expect(cache.size()).toBe(2);
    await cache.get('a', load); // evicted, reloads
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('does not re-cache a load that was invalidated while in flight', async () => {
    const cache = make();
    let resolve!: (v: { teams: number[] }) => void;
    const slow = jest.fn(() => new Promise<{ teams: number[] }>((r) => (resolve = r)));

    const pending = cache.get('u', slow);
    cache.clear();
    resolve({ teams: [1] });
    await pending;

    await cache.get('u', jest.fn().mockResolvedValue({ teams: [2] }));
    expect(cache.size()).toBe(1);
    const reload = jest.fn().mockResolvedValue({ teams: [3] });
    expect((await cache.get('u', reload)).teams).toEqual([2]);
    expect(reload).not.toHaveBeenCalled();
  });
});
