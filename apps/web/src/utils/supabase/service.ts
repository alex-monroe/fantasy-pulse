import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client, for the few server paths that write on
 * nobody's behalf and so have no `auth.uid()` to be scoped by.
 *
 * This key bypasses RLS entirely. Only reach for it when the write
 * genuinely belongs to the instance rather than a user — today that is
 * the shared news pool (`fp_news_items`), whose table grants no write
 * access to the anon role on purpose. Anything acting for a signed-in
 * user should use `./server.ts` (cookies) or `./api.ts` (bearer token)
 * so their RLS policies still apply.
 *
 * Never import this from a client component.
 *
 * @returns A Supabase client authenticated with the service role key.
 * @throws When `SUPABASE_SERVICE_ROLE_KEY` is not configured.
 */
export function createServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured; this operation cannot run with the anon key.',
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
