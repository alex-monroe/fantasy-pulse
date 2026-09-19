import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps a same-origin path, query string and all', () => {
    expect(safeRedirectPath('/reset-password?foo=bar')).toBe('/reset-password?foo=bar');
  });

  it.each([
    ['nothing at all', null],
    ['an empty string', ''],
    ['a protocol-relative URL', '//evil.example.com'],
    ['a backslash-escaped host', '/\\evil.example.com'],
    ['an absolute URL', 'https://evil.example.com/'],
    ['a bare path', 'reset-password'],
  ])('falls back on %s', (_label, next) => {
    expect(safeRedirectPath(next)).toBe('/');
  });

  it('uses the caller-supplied fallback', () => {
    expect(safeRedirectPath('https://evil.example.com', '/login')).toBe('/login');
  });
});
