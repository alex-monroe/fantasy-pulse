import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Bearer-token Supabase client for API routes called from non-browser
 * clients (mobile, scripts) that authenticate via the standard
 * `Authorization: Bearer <jwt>` header instead of cookies.
 *
 * The JWT is forwarded on every PostgREST request so RLS policies see
 * `auth.uid()` set to the user. Sessions are not persisted on the
 * server — each request authenticates independently.
 */
export function createApiClient(authHeader: string | null | undefined) {
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
