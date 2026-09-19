/**
 * @jest-environment node
 */
const exchangeCodeForSession = jest.fn();
const verifyOtp = jest.fn();

jest.mock('@/utils/supabase/server', () => ({
  createClient: () => ({ auth: { exchangeCodeForSession, verifyOtp } }),
}));

import { GET } from './route';

function get(query: string) {
  return GET(new Request(`https://rosterloom.test/auth/callback${query}`));
}

beforeEach(() => {
  exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset().mockResolvedValue({ error: null });
});

describe('GET /auth/callback', () => {
  it('exchanges a PKCE code and forwards to next', async () => {
    const response = await get('?code=abc123&next=/reset-password');

    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://rosterloom.test/reset-password',
    );
  });

  it('verifies a token_hash link, so the email works on another device', async () => {
    const response = await get('?token_hash=hash123&type=recovery&next=/reset-password');

    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'hash123' });
    expect(response.headers.get('location')).toBe(
      'https://rosterloom.test/reset-password',
    );
  });

  it('sends a spent or tampered link back to login with an error code', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'expired' } });

    const response = await get('?code=abc123&next=/reset-password');

    expect(response.headers.get('location')).toBe(
      'https://rosterloom.test/login?error=invalid_link',
    );
  });

  it('rejects a link carrying no credentials at all', async () => {
    const response = await get('?next=/reset-password');

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://rosterloom.test/login?error=invalid_link',
    );
  });

  it('rejects an unknown OTP type rather than passing it through', async () => {
    const response = await get('?token_hash=hash123&type=not_a_type');

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe(
      'https://rosterloom.test/login?error=invalid_link',
    );
  });

  it('will not bounce the browser off-origin via next', async () => {
    const response = await get('?code=abc123&next=//evil.example.com');

    expect(response.headers.get('location')).toBe('https://rosterloom.test/');
  });
});
