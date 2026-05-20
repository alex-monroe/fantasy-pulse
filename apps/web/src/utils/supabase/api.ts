import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Bearer-token Supabase client for API routes called from non-browser
 * clients (mobile, scripts) that authenticate via the standard
 * `Authorization: Bearer <jwt>` header instead of cookies.
 *
 * Uses the `accessToken` option (v2.45+) so supabase-js forwards the
 * provided JWT on every PostgREST and Realtime request. An earlier
 * implementation set the token in `global.headers.Authorization`,
 * which PostgREST silently overrode with the (empty) session token —
 * queries ran as the anon role, RLS denied everything, and the route
 * returned empty arrays with no visible error.
 */
export function createApiClient(authHeader: string | null | undefined) {
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      accessToken: token ? async () => token : undefined,
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
