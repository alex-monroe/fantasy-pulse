import { getPlayerInfoCacheTtlMs } from '@/lib/cache';

describe('player info cache ttl', () => {
  it('expires at the next Pacific midnight when sooner than a day', () => {
    const now = new Date('2024-05-10T12:00:00Z');
    const expectedExpiration = new Date('2024-05-11T07:00:00Z');
    const ttl = getPlayerInfoCacheTtlMs(now);
    expect(ttl).toBe(expectedExpiration.getTime() - now.getTime());
  });

  it('never exceeds 24 hours even across DST changes', () => {
    const now = new Date('2024-11-03T07:00:00Z');
    const ttl = getPlayerInfoCacheTtlMs(now);
    expect(ttl).toBe(24 * 60 * 60 * 1000);
  });
});
