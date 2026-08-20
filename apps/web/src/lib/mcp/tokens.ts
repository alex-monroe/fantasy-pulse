/**
 * Minting and verification of MCP personal access tokens.
 *
 * The plaintext token is returned to the user exactly once (at creation);
 * only its SHA-256 lands in `fp_mcp_tokens`. Verification hashes the
 * presented token and asks Postgres to resolve the owner via the
 * `fp_mcp_token_owner` SECURITY DEFINER function, which also stamps
 * `last_used_at`.
 */
import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Prefix every token carries, so leaked strings are recognisable. */
export const MCP_TOKEN_PREFIX = 'rl_mcp_';

/** Bytes of entropy behind each token. */
const TOKEN_ENTROPY_BYTES = 32;

/** How much of the plaintext we keep for display (`rl_mcp_abcd1234…`). */
const DISPLAY_PREFIX_LENGTH = MCP_TOKEN_PREFIX.length + 8;

/** A freshly minted token: plaintext (shown once) plus what to persist. */
export type MintedToken = {
  /** Full plaintext token. Never stored. */
  token: string;
  /** SHA-256 of the plaintext, hex encoded. */
  tokenHash: string;
  /** Leading characters of the plaintext, safe to display later. */
  tokenPrefix: string;
};

/**
 * Hashes a token the same way stored hashes were produced.
 *
 * @param token - The plaintext token.
 * @returns Hex-encoded SHA-256 of the token.
 */
export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Generates a new token with 256 bits of entropy.
 *
 * @returns The plaintext token alongside the values to persist.
 */
export function mintMcpToken(): MintedToken {
  const token = `${MCP_TOKEN_PREFIX}${randomBytes(TOKEN_ENTROPY_BYTES).toString('base64url')}`;

  return {
    token,
    tokenHash: hashMcpToken(token),
    tokenPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

/**
 * Extracts a bearer token from an `Authorization` header.
 *
 * @param header - The raw header value, if any.
 * @returns The token, or `null` when the header is absent or not bearer.
 */
export function parseBearerToken(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }

  const match = header.match(/^bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  return token ? token : null;
}

/**
 * Resolves the user a token belongs to.
 *
 * @param client - Supabase client (anon key is sufficient — the RPC is
 *   SECURITY DEFINER).
 * @param token - The plaintext token presented by the caller.
 * @returns The owning user id, or `null` when the token is unknown,
 *   revoked, or malformed.
 */
export async function resolveMcpTokenUser(
  client: SupabaseClient,
  token: string,
): Promise<string | null> {
  if (!token.startsWith(MCP_TOKEN_PREFIX)) {
    return null;
  }

  const { data, error } = await client.rpc('fp_mcp_token_owner', {
    p_token_hash: hashMcpToken(token),
  });

  if (error) {
    console.error('Failed to resolve MCP token', error.message);
    return null;
  }

  return typeof data === 'string' && data ? data : null;
}
