'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/utils/supabase/server';
import { mintMcpToken } from '@/lib/mcp/tokens';

/** A stored token as shown in the management UI. Never includes the secret. */
export type McpTokenRecord = {
  id: number;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

/**
 * Lists the current user's MCP tokens, newest first.
 *
 * @returns The tokens, or an error message.
 */
export async function listMcpTokens(): Promise<
  { tokens: McpTokenRecord[] } | { error: string }
> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { data, error } = await supabase
    .from('fp_mcp_tokens')
    .select('id, name, token_prefix, created_at, last_used_at')
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return { tokens: (data ?? []) as McpTokenRecord[] };
}

/**
 * Mints a new MCP access token for the current user.
 *
 * The plaintext token is returned once here and never stored, so the
 * caller must surface it immediately.
 *
 * @param name - A label to identify the token later.
 * @returns The plaintext token, or an error message.
 */
export async function createMcpToken(
  name: string,
): Promise<{ token: string } | { error: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const trimmedName = name.trim().slice(0, 80) || 'MCP token';
  const { token, tokenHash, tokenPrefix } = mintMcpToken();

  const { error } = await supabase.from('fp_mcp_tokens').insert({
    user_id: user.id,
    name: trimmedName,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/mcp');

  return { token };
}

/**
 * Revokes a token, immediately invalidating it for MCP requests.
 *
 * @param id - The token's id.
 * @returns Success, or an error message.
 */
export async function revokeMcpToken(
  id: number,
): Promise<{ success: true } | { error: string }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'You must be logged in.' };
  }

  const { error } = await supabase
    .from('fp_mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/mcp');

  return { success: true };
}
