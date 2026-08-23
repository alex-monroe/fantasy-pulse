/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591) + authorization code
 * flow with PKCE (RFC 7636) for the hosted MCP server.
 *
 * This is the "discover, self-register, redirect through login" path
 * that connector UIs (e.g. Claude.ai's remote MCP connector) require,
 * sitting alongside the manual personal-access-token flow in tokens.ts.
 * Clients are always public (no client_secret) — PKCE is mandatory
 * instead, matching what the MCP auth spec expects of native/desktop/
 * web clients that can't hold a secret safely.
 *
 * All lookups run through the SECURITY DEFINER functions added in
 * supabase/migrations/20260823120000_add_fp_mcp_oauth.sql, since these
 * endpoints are reached by callers with no Supabase session.
 */
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Prefix for dynamically registered client ids. */
const CLIENT_ID_PREFIX = 'rl_mcp_client_';
/** Prefix for authorization codes. */
const CODE_PREFIX = 'rl_mcp_code_';
/** Prefix for OAuth-issued access tokens (distinct from manual PATs). */
const ACCESS_TOKEN_PREFIX = 'rl_mcp_at_';
/** Prefix for OAuth refresh tokens. */
const REFRESH_TOKEN_PREFIX = 'rl_mcp_rt_';

/** How long an authorization code is valid for before it must be exchanged. */
const CODE_TTL_MS = 5 * 60 * 1000;
/** How long an access token is valid for before it must be refreshed. */
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A registered OAuth client. */
export type OAuthClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

/**
 * Registers a new dynamic client (RFC 7591). Registration is open — no
 * admin approval — since a connector UI calls this the first time a
 * user adds the server, before any human is in the loop.
 *
 * @param supabase - Service-role (or anon) Supabase client.
 * @param clientName - Human-readable name from the client's metadata.
 * @param redirectUris - Redirect URIs the client may be sent back to.
 * @returns The newly registered client.
 */
export async function registerOAuthClient(
  supabase: SupabaseClient,
  clientName: string,
  redirectUris: string[],
): Promise<OAuthClient> {
  const clientId = randomToken(CLIENT_ID_PREFIX);

  const { error } = await supabase.rpc('fp_mcp_oauth_register_client', {
    p_client_id: clientId,
    p_client_name: clientName,
    p_redirect_uris: redirectUris,
  });

  if (error) {
    throw new Error(`Failed to register OAuth client: ${error.message}`);
  }

  return { clientId, clientName, redirectUris };
}

/**
 * Looks up a registered client, for validating /authorize and /token
 * requests (redirect_uri match, client existence).
 *
 * @param supabase - Service-role (or anon) Supabase client.
 * @param clientId - The client id presented by the caller.
 * @returns The client, or `null` if unknown.
 */
export async function getOAuthClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<OAuthClient | null> {
  const { data, error } = await supabase
    .rpc('fp_mcp_oauth_get_client', { p_client_id: clientId })
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as { client_id: string; client_name: string; redirect_uris: string[] | null };

  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectUris: row.redirect_uris ?? [],
  };
}

/**
 * Computes the PKCE `S256` code challenge for a verifier, per RFC 7636:
 * base64url(sha256(verifier)).
 *
 * @param verifier - The `code_verifier` presented at the token endpoint.
 * @returns The expected `code_challenge`.
 */
export function computeCodeChallengeS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/**
 * Creates and stores an authorization code once a logged-in user
 * approves a client at /mcp/authorize. Runs under the user's own
 * Supabase session (RLS: insert own).
 *
 * @param supabase - A Supabase client carrying the user's session.
 * @param params - The client, user, redirect URI and PKCE challenge to bind the code to.
 * @returns The plaintext code to append to the redirect.
 */
export async function createAuthorizationCode(
  supabase: SupabaseClient,
  params: {
    clientId: string;
    userId: string;
    redirectUri: string;
    codeChallenge: string;
  },
): Promise<string> {
  const code = randomToken(CODE_PREFIX);

  const { error } = await supabase.from('fp_mcp_oauth_codes').insert({
    code_hash: hash(code),
    client_id: params.clientId,
    user_id: params.userId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  if (error) {
    throw new Error(`Failed to create authorization code: ${error.message}`);
  }

  return code;
}

export type CodeExchangeResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

/**
 * Validates and consumes an authorization code at the token endpoint:
 * checks the client, redirect URI and PKCE verifier match, then atomically
 * marks the code used so it can never be replayed.
 *
 * @param supabase - Service-role (or anon) Supabase client.
 * @param params - The code and the values the client presents alongside it.
 * @returns The owning user id, or an error describing why the exchange failed.
 */
export async function exchangeAuthorizationCode(
  supabase: SupabaseClient,
  params: { code: string; clientId: string; redirectUri: string; codeVerifier: string },
): Promise<CodeExchangeResult> {
  const codeHash = hash(params.code);

  const { data, error } = await supabase
    .rpc('fp_mcp_oauth_peek_code', { p_code_hash: codeHash })
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: 'invalid_grant' };
  }

  const row = data as {
    client_id: string;
    user_id: string;
    redirect_uri: string;
    code_challenge: string;
    expires_at: string;
    used_at: string | null;
  };

  if (row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: 'invalid_grant' };
  }

  if (row.client_id !== params.clientId || row.redirect_uri !== params.redirectUri) {
    return { ok: false, error: 'invalid_grant' };
  }

  if (computeCodeChallengeS256(params.codeVerifier) !== row.code_challenge) {
    return { ok: false, error: 'invalid_grant' };
  }

  const { data: consumed, error: consumeError } = await supabase.rpc(
    'fp_mcp_oauth_consume_code',
    { p_code_hash: codeHash },
  );

  if (consumeError || !consumed) {
    return { ok: false, error: 'invalid_grant' };
  }

  return { ok: true, userId: row.user_id };
}

/** A freshly minted or rotated access/refresh token pair. */
export type OAuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/**
 * Issues the first access/refresh pair after a successful code exchange.
 *
 * @param supabase - Service-role (or anon) Supabase client.
 * @param params - The user and client the tokens belong to.
 * @returns The plaintext token pair.
 */
export async function issueOAuthTokens(
  supabase: SupabaseClient,
  params: { userId: string; clientId: string },
): Promise<OAuthTokenPair> {
  const accessToken = randomToken(ACCESS_TOKEN_PREFIX);
  const refreshToken = randomToken(REFRESH_TOKEN_PREFIX);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  const { error } = await supabase.rpc('fp_mcp_oauth_issue_tokens', {
    p_user_id: params.userId,
    p_client_id: params.clientId,
    p_access_hash: hash(accessToken),
    p_refresh_hash: hash(refreshToken),
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(`Failed to issue OAuth tokens: ${error.message}`);
  }

  return { accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Rotates a refresh token: the old refresh token stops working the
 * instant this succeeds, whether or not the caller was the legitimate
 * client (protects against a stolen-then-replayed refresh token, since
 * the real client's next refresh attempt will also fail and surface the
 * compromise).
 *
 * @param supabase - Service-role (or anon) Supabase client.
 * @param refreshToken - The plaintext refresh token presented by the client.
 * @param clientId - The client id presented alongside it; must match the token's owner.
 * @returns The new token pair, or `null` if the refresh token is invalid, expired-out, or belongs to a different client.
 */
export async function rotateOAuthTokens(
  supabase: SupabaseClient,
  refreshToken: string,
  clientId: string,
): Promise<OAuthTokenPair | null> {
  if (!refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
    return null;
  }

  const newAccessToken = randomToken(ACCESS_TOKEN_PREFIX);
  const newRefreshToken = randomToken(REFRESH_TOKEN_PREFIX);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  const { data, error } = await supabase
    .rpc('fp_mcp_oauth_rotate_refresh_token', {
      p_old_refresh_hash: hash(refreshToken),
      p_new_access_hash: hash(newAccessToken),
      p_new_refresh_hash: hash(newRefreshToken),
      p_expires_at: expiresAt.toISOString(),
    })
    .maybeSingle();

  const row = data as { user_id: string; client_id: string } | null;

  if (error || !row || row.client_id !== clientId) {
    return null;
  }

  return { accessToken: newAccessToken, refreshToken: newRefreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/**
 * Resolves an OAuth access token to its owning user, mirroring
 * `resolveMcpTokenUser` in tokens.ts but for tokens minted via this
 * flow (checked for expiry, not just revocation).
 *
 * @param supabase - Service-role (or anon) Supabase client.
 * @param token - The plaintext bearer token presented by the caller.
 * @returns The owning user id, or `null` if the token isn't an OAuth access token, or is unknown/expired/revoked.
 */
export async function resolveOAuthAccessTokenUser(
  supabase: SupabaseClient,
  token: string,
): Promise<string | null> {
  if (!token.startsWith(ACCESS_TOKEN_PREFIX)) {
    return null;
  }

  const { data, error } = await supabase.rpc('fp_mcp_oauth_access_token_owner', {
    p_token_hash: hash(token),
  });

  if (error) {
    console.error('Failed to resolve OAuth access token', error.message);
    return null;
  }

  return typeof data === 'string' && data ? data : null;
}
