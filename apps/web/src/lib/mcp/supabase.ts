/**
 * Supabase client for MCP endpoints reached by an unauthenticated
 * caller — the JSON-RPC endpoint itself, and the OAuth register/token
 * endpoints in the DCR flow. None of these carry a Supabase session, so
 * there is no `auth.uid()` to scope queries with the way a normal
 * server action can.
 *
 * Prefers the service role key when configured, falling back to the
 * anon key (which still works: every table these endpoints touch is
 * reachable only through SECURITY DEFINER functions or is explicitly
 * scoped by user id in application code).
 */
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

export function createMcpSupabaseClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
