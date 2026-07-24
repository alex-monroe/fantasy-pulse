import {
  DEMO_COOKIE,
  DEMO_HEADER,
  DEMO_QUERY_PARAM,
  isDemoModeEnv,
  parseDemoQueryToggle,
  resolveDemoMode,
} from './demo-mode';

describe('demo-mode helpers', () => {
  const originalEnv = process.env.DEMO_MODE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DEMO_MODE;
    } else {
      process.env.DEMO_MODE = originalEnv;
    }
  });

  it('exposes stable cookie/query/header names', () => {
    expect(DEMO_COOKIE).toBe('rl_demo');
    expect(DEMO_QUERY_PARAM).toBe('demo');
    expect(DEMO_HEADER).toBe('x-demo-mode');
  });

  describe('isDemoModeEnv', () => {
    it.each(['1', 'true', 'on', 'YES'])('is true for %s', (value) => {
      process.env.DEMO_MODE = value;
      expect(isDemoModeEnv()).toBe(true);
    });

    it.each(['', '0', 'false', undefined])('is false for %s', (value) => {
      if (value === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = value;
      expect(isDemoModeEnv()).toBe(false);
    });
  });

  describe('resolveDemoMode', () => {
    beforeEach(() => {
      delete process.env.DEMO_MODE;
    });

    it('is false with no signals', () => {
      expect(resolveDemoMode({})).toBe(false);
    });

    it('honors the env switch', () => {
      process.env.DEMO_MODE = '1';
      expect(resolveDemoMode({})).toBe(true);
    });

    it('honors a truthy cookie', () => {
      expect(resolveDemoMode({ cookieValue: '1' })).toBe(true);
      expect(resolveDemoMode({ cookieValue: '' })).toBe(false);
    });

    it('honors a truthy header', () => {
      expect(resolveDemoMode({ headerValue: '1' })).toBe(true);
      expect(resolveDemoMode({ headerValue: '0' })).toBe(false);
    });
  });

  describe('parseDemoQueryToggle', () => {
    it('returns null when the param is absent', () => {
      expect(parseDemoQueryToggle(null)).toBeNull();
      expect(parseDemoQueryToggle(undefined)).toBeNull();
    });

    it('parses on/off values', () => {
      expect(parseDemoQueryToggle('1')).toBe(true);
      expect(parseDemoQueryToggle('true')).toBe(true);
      expect(parseDemoQueryToggle('0')).toBe(false);
      expect(parseDemoQueryToggle('')).toBe(false);
    });
  });
});
