import { createHash } from 'crypto';

import {
  computeCodeChallengeS256,
  exchangeAuthorizationCode,
  getOAuthClient,
  registerOAuthClient,
  resolveOAuthAccessTokenUser,
  rotateOAuthTokens,
} from './oauth';

/** Builds a fake SupabaseClient whose `.rpc()` resolves `response`, and
 * whose result also answers `.maybeSingle()` with the same response, so
 * both calling styles used across oauth.ts work against one mock. */
function client(response: { data?: unknown; error?: unknown }) {
  const rpc = jest.fn().mockReturnValue({
    data: response.data,
    error: response.error,
    maybeSingle: () => Promise.resolve(response),
  });
  return { rpc } as never;
}

describe('computeCodeChallengeS256', () => {
  it('matches the RFC 7636 base64url(sha256(verifier)) construction', () => {
    const verifier = 'a-random-code-verifier';
    const expected = createHash('sha256').update(verifier, 'ascii').digest('base64url');

    expect(computeCodeChallengeS256(verifier)).toBe(expected);
  });
});

describe('registerOAuthClient', () => {
  it('registers a client and returns it with a generated id', async () => {
    const supabase = client({ data: null, error: null });

    const registered = await registerOAuthClient(supabase, 'My App', ['https://app.example/cb']);

    expect(registered.clientId.startsWith('rl_mcp_client_')).toBe(true);
    expect(registered.clientName).toBe('My App');
    expect(registered.redirectUris).toEqual(['https://app.example/cb']);
    expect((supabase as never as { rpc: jest.Mock }).rpc).toHaveBeenCalledWith(
      'fp_mcp_oauth_register_client',
      expect.objectContaining({ p_client_name: 'My App', p_redirect_uris: ['https://app.example/cb'] }),
    );
  });

  it('throws when the database call fails', async () => {
    const supabase = client({ data: null, error: { message: 'boom' } });

    await expect(registerOAuthClient(supabase, 'My App', ['https://app.example/cb'])).rejects.toThrow(
      'boom',
    );
  });
});

describe('getOAuthClient', () => {
  it('returns the client on a match', async () => {
    const supabase = client({
      data: { client_id: 'c1', client_name: 'My App', redirect_uris: ['https://app.example/cb'] },
      error: null,
    });

    await expect(getOAuthClient(supabase, 'c1')).resolves.toEqual({
      clientId: 'c1',
      clientName: 'My App',
      redirectUris: ['https://app.example/cb'],
    });
  });

  it('returns null when unknown', async () => {
    const supabase = client({ data: null, error: null });

    await expect(getOAuthClient(supabase, 'nope')).resolves.toBeNull();
  });
});

describe('resolveOAuthAccessTokenUser', () => {
  it('rejects tokens without the OAuth access-token prefix without querying', async () => {
    const supabase = client({ data: 'user-1', error: null });

    await expect(resolveOAuthAccessTokenUser(supabase, 'rl_mcp_not_an_at')).resolves.toBeNull();
    expect((supabase as never as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('returns the owning user id for a valid token', async () => {
    const supabase = client({ data: 'user-1', error: null });

    await expect(resolveOAuthAccessTokenUser(supabase, 'rl_mcp_at_abc')).resolves.toBe('user-1');
  });

  it('returns null when expired or revoked', async () => {
    const supabase = client({ data: null, error: null });

    await expect(resolveOAuthAccessTokenUser(supabase, 'rl_mcp_at_abc')).resolves.toBeNull();
  });
});

describe('exchangeAuthorizationCode', () => {
  const baseRow = {
    client_id: 'c1',
    user_id: 'user-1',
    redirect_uri: 'https://app.example/cb',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null as string | null,
  };

  it('rejects a mismatched PKCE verifier without consuming the code', async () => {
    const supabase = client({ data: { ...baseRow, code_challenge: 'expected-challenge' }, error: null });

    const result = await exchangeAuthorizationCode(supabase, {
      code: 'code-1',
      clientId: 'c1',
      redirectUri: 'https://app.example/cb',
      codeVerifier: 'wrong-verifier',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });

  it('succeeds and consumes the code when everything matches', async () => {
    const verifier = 'correct-verifier';
    const challenge = computeCodeChallengeS256(verifier);

    const rpc = jest
      .fn()
      .mockReturnValueOnce({ maybeSingle: () => Promise.resolve({ data: { ...baseRow, code_challenge: challenge }, error: null }) })
      .mockReturnValueOnce(Promise.resolve({ data: true, error: null }));

    const supabase = { rpc } as never;

    const result = await exchangeAuthorizationCode(supabase, {
      code: 'code-1',
      clientId: 'c1',
      redirectUri: 'https://app.example/cb',
      codeVerifier: verifier,
    });

    expect(result).toEqual({ ok: true, userId: 'user-1' });
  });

  it('rejects an already-used code', async () => {
    const supabase = client({
      data: { ...baseRow, used_at: new Date().toISOString(), code_challenge: 'x' },
      error: null,
    });

    const result = await exchangeAuthorizationCode(supabase, {
      code: 'code-1',
      clientId: 'c1',
      redirectUri: 'https://app.example/cb',
      codeVerifier: 'whatever',
    });

    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });
});

describe('rotateOAuthTokens', () => {
  it('rejects tokens without the refresh-token prefix without querying', async () => {
    const supabase = client({ data: null, error: null });

    await expect(rotateOAuthTokens(supabase, 'not-a-refresh-token', 'c1')).resolves.toBeNull();
    expect((supabase as never as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('returns null when the client_id does not match the token owner', async () => {
    const supabase = client({ data: { user_id: 'user-1', client_id: 'other-client' }, error: null });

    await expect(rotateOAuthTokens(supabase, 'rl_mcp_rt_abc', 'c1')).resolves.toBeNull();
  });

  it('returns a fresh token pair on success', async () => {
    const supabase = client({ data: { user_id: 'user-1', client_id: 'c1' }, error: null });

    const tokens = await rotateOAuthTokens(supabase, 'rl_mcp_rt_abc', 'c1');

    expect(tokens?.accessToken.startsWith('rl_mcp_at_')).toBe(true);
    expect(tokens?.refreshToken.startsWith('rl_mcp_rt_')).toBe(true);
    expect(tokens?.expiresIn).toBe(3600);
  });
});
