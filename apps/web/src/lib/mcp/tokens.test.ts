import {
  MCP_TOKEN_PREFIX,
  hashMcpToken,
  mintMcpToken,
  parseBearerToken,
  resolveMcpTokenUser,
  tokensMatch,
} from './tokens';

describe('mintMcpToken', () => {
  it('produces a prefixed token with its hash and display prefix', () => {
    const { token, tokenHash, tokenPrefix } = mintMcpToken();

    expect(token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(tokenHash).toBe(hashMcpToken(token));
    expect(tokenHash).toHaveLength(64);
    expect(token.startsWith(tokenPrefix)).toBe(true);
    // The stored prefix must not be enough to reconstruct the token.
    expect(tokenPrefix.length).toBeLessThan(token.length);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => mintMcpToken().token));
    expect(tokens.size).toBe(50);
  });
});

describe('parseBearerToken', () => {
  it.each([
    ['Bearer abc123', 'abc123'],
    ['bearer abc123', 'abc123'],
    ['Bearer   abc123  ', 'abc123'],
  ])('parses %s', (header, expected) => {
    expect(parseBearerToken(header)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['Basic abc123'], ['Bearer'], ['Bearer   ']])(
    'rejects %s',
    (header) => {
      expect(parseBearerToken(header as string | null)).toBeNull();
    },
  );
});

describe('tokensMatch', () => {
  it('compares equal tokens', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
  });

  it('rejects different tokens and lengths', () => {
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
  });
});

describe('resolveMcpTokenUser', () => {
  const client = (response: { data?: unknown; error?: unknown }) =>
    ({ rpc: jest.fn().mockResolvedValue(response) }) as never;

  it('returns the owning user id', async () => {
    const supabase = client({ data: 'user-1', error: null });

    await expect(resolveMcpTokenUser(supabase, `${MCP_TOKEN_PREFIX}abc`)).resolves.toBe(
      'user-1',
    );
  });

  it('passes the hash, never the plaintext', async () => {
    const supabase = client({ data: 'user-1', error: null });
    const token = `${MCP_TOKEN_PREFIX}secret`;

    await resolveMcpTokenUser(supabase, token);

    expect((supabase as never as { rpc: jest.Mock }).rpc).toHaveBeenCalledWith(
      'fp_mcp_token_owner',
      { p_token_hash: hashMcpToken(token) },
    );
  });

  it('rejects tokens without the expected prefix without querying', async () => {
    const supabase = client({ data: 'user-1', error: null });

    await expect(resolveMcpTokenUser(supabase, 'some-other-token')).resolves.toBeNull();
    expect((supabase as never as { rpc: jest.Mock }).rpc).not.toHaveBeenCalled();
  });

  it('returns null when the token is unknown or revoked', async () => {
    const supabase = client({ data: null, error: null });

    await expect(
      resolveMcpTokenUser(supabase, `${MCP_TOKEN_PREFIX}abc`),
    ).resolves.toBeNull();
  });

  it('returns null on a database error', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = client({ data: null, error: { message: 'boom' } });

    await expect(
      resolveMcpTokenUser(supabase, `${MCP_TOKEN_PREFIX}abc`),
    ).resolves.toBeNull();

    errorSpy.mockRestore();
  });
});
