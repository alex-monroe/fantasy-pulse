-- Personal access tokens for the hosted MCP server (`POST /api/mcp`).
--
-- MCP clients (Claude Desktop, Claude Code, ...) hold a static string in
-- their config, so Supabase's hour-long access tokens are unusable here.
-- Instead a user mints a long-lived `rl_mcp_<random>` token from /mcp and
-- sends it as `Authorization: Bearer <token>`.
--
-- Only the SHA-256 of the token is stored; the plaintext is shown once at
-- creation and is unrecoverable afterwards.
CREATE TABLE public.fp_mcp_tokens (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  -- User-facing label so a token can be identified before revoking it.
  name TEXT NOT NULL DEFAULT 'MCP token',
  -- First few characters of the plaintext, kept for display only.
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX fp_mcp_tokens_user_id_idx ON public.fp_mcp_tokens (user_id);

-- Unlike the other fp_ tables (which predate any RLS policy), this one
-- holds credential material, so it is locked down: a user may only ever
-- see and manage their own tokens, and the hash column is never readable
-- by the anon role. Token verification goes through
-- fp_mcp_token_owner() below, which runs as the definer.
ALTER TABLE public.fp_mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_mcp_tokens_select_own ON public.fp_mcp_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY fp_mcp_tokens_insert_own ON public.fp_mcp_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY fp_mcp_tokens_update_own ON public.fp_mcp_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY fp_mcp_tokens_delete_own ON public.fp_mcp_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Resolves a presented token hash to its owner and stamps last_used_at.
--
-- SECURITY DEFINER because the caller is unauthenticated by definition —
-- the token *is* the credential being checked. Safe to expose: the caller
-- must already know the SHA-256 of a 32-byte random token, and the
-- function returns nothing but the owning user id.
CREATE OR REPLACE FUNCTION public.fp_mcp_token_owner(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE public.fp_mcp_tokens
     SET last_used_at = NOW()
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_token_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_token_owner(TEXT) TO anon, authenticated;
