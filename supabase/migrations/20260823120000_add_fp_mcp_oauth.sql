-- OAuth 2.0 Dynamic Client Registration (RFC 7591) + authorization code
-- flow with PKCE for the hosted MCP server (`POST /api/mcp`).
--
-- This sits alongside the existing `fp_mcp_tokens` personal access token
-- flow (docs/MCP.md) rather than replacing it: PATs remain the "paste a
-- token" path for clients like Claude Code, while this is the "discover,
-- self-register, and redirect the user through login" path that
-- connector UIs (e.g. Claude.ai's remote MCP connector) require.
--
-- Clients are public (no client_secret) per the MCP auth spec's
-- expectation that native/desktop/web clients can't hold a secret
-- safely; PKCE (S256) is mandatory instead.
--
-- All three tables are unauthenticated-caller surfaces (a DCR client has
-- no Supabase session), so verification/consumption goes through
-- SECURITY DEFINER functions, mirroring fp_mcp_token_owner.

-- Dynamically registered OAuth clients.
CREATE TABLE public.fp_mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fp_mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
-- No policies: only reachable via the SECURITY DEFINER functions below,
-- or a service-role connection.

-- Short-lived authorization codes issued at /mcp/authorize once a
-- logged-in user approves a client. Single use.
CREATE TABLE public.fp_mcp_oauth_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES public.fp_mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fp_mcp_oauth_codes_user_id_idx ON public.fp_mcp_oauth_codes (user_id);

ALTER TABLE public.fp_mcp_oauth_codes ENABLE ROW LEVEL SECURITY;

-- Issuing a code happens on /mcp/authorize, where the caller *does*
-- carry a real Supabase session, so this one path uses an ordinary RLS
-- policy rather than a SECURITY DEFINER function.
CREATE POLICY fp_mcp_oauth_codes_insert_own ON public.fp_mcp_oauth_codes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Access/refresh token pairs minted by the token endpoint. Refresh
-- rotates in place: fp_mcp_oauth_rotate_refresh_token overwrites both
-- hashes on the same row, so a stolen, already-rotated refresh token
-- stops working the moment the legitimate client refreshes.
CREATE TABLE public.fp_mcp_oauth_tokens (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES public.fp_mcp_oauth_clients(client_id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX fp_mcp_oauth_tokens_user_id_idx ON public.fp_mcp_oauth_tokens (user_id);

ALTER TABLE public.fp_mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_mcp_oauth_tokens_select_own ON public.fp_mcp_oauth_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Lets a user revoke an OAuth-connected app from /mcp, same as a PAT.
CREATE POLICY fp_mcp_oauth_tokens_update_own ON public.fp_mcp_oauth_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Registers a new DCR client. Open registration (no admin approval) is
-- what the MCP auth spec expects: a connector UI calls this the first
-- time a user adds the server, with no human in the loop yet.
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_register_client(
  p_client_id TEXT,
  p_client_name TEXT,
  p_redirect_uris TEXT[]
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.fp_mcp_oauth_clients (client_id, client_name, redirect_uris)
  VALUES (p_client_id, p_client_name, p_redirect_uris);
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_register_client(TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_register_client(TEXT, TEXT, TEXT[]) TO anon, authenticated;

-- Looks up a registered client by id, for validating /authorize and
-- /token requests (redirect_uri match, client existence).
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_get_client(p_client_id TEXT)
RETURNS TABLE (client_id TEXT, client_name TEXT, redirect_uris TEXT[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT client_id, client_name, redirect_uris
    FROM public.fp_mcp_oauth_clients
   WHERE client_id = p_client_id;
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_get_client(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_get_client(TEXT) TO anon, authenticated;

-- Reads a pending code without consuming it, so the token endpoint can
-- verify the PKCE challenge (computed in application code) before
-- deciding whether to mark it used.
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_peek_code(p_code_hash TEXT)
RETURNS TABLE (
  client_id TEXT,
  user_id UUID,
  redirect_uri TEXT,
  code_challenge TEXT,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT client_id, user_id, redirect_uri, code_challenge, expires_at, used_at
    FROM public.fp_mcp_oauth_codes
   WHERE code_hash = p_code_hash;
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_peek_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_peek_code(TEXT) TO anon, authenticated;

-- Atomically marks a code used (single-use enforcement); returns false
-- if it was already consumed or never existed, so a replayed code can
-- never succeed even under a race.
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_consume_code(p_code_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE public.fp_mcp_oauth_codes
     SET used_at = NOW()
   WHERE code_hash = p_code_hash
     AND used_at IS NULL
     AND expires_at > NOW()
  RETURNING TRUE INTO v_updated;

  RETURN COALESCE(v_updated, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_consume_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_consume_code(TEXT) TO anon, authenticated;

-- Issues the first access/refresh pair after a successful code exchange.
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_issue_tokens(
  p_user_id UUID,
  p_client_id TEXT,
  p_access_hash TEXT,
  p_refresh_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.fp_mcp_oauth_tokens
    (user_id, client_id, access_token_hash, refresh_token_hash, expires_at)
  VALUES (p_user_id, p_client_id, p_access_hash, p_refresh_hash, p_expires_at);
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_issue_tokens(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_issue_tokens(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;

-- Resolves a presented OAuth access token to its owner, same shape as
-- fp_mcp_token_owner but also enforcing expiry.
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_access_token_owner(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE public.fp_mcp_oauth_tokens
     SET last_used_at = NOW()
   WHERE access_token_hash = p_token_hash
     AND revoked_at IS NULL
     AND expires_at > NOW()
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_access_token_owner(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_access_token_owner(TEXT) TO anon, authenticated;

-- Rotates a refresh token: overwrites the access/refresh hashes on the
-- matching row in place and returns who it belongs to. Returns no rows
-- if the refresh token is unknown, already rotated, or revoked, which
-- covers both expiry and replay of a stale token.
CREATE OR REPLACE FUNCTION public.fp_mcp_oauth_rotate_refresh_token(
  p_old_refresh_hash TEXT,
  p_new_access_hash TEXT,
  p_new_refresh_hash TEXT,
  p_expires_at TIMESTAMPTZ
) RETURNS TABLE (user_id UUID, client_id TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.fp_mcp_oauth_tokens
     SET access_token_hash = p_new_access_hash,
         refresh_token_hash = p_new_refresh_hash,
         expires_at = p_expires_at,
         last_used_at = NOW()
   WHERE refresh_token_hash = p_old_refresh_hash
     AND revoked_at IS NULL
  RETURNING user_id, client_id;
$$;

REVOKE ALL ON FUNCTION public.fp_mcp_oauth_rotate_refresh_token(TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_mcp_oauth_rotate_refresh_token(TEXT, TEXT, TEXT, TIMESTAMPTZ) TO anon, authenticated;
