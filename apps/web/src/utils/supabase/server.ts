import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for use on the server.
 *
 * @remarks
 * This function uses Next.js `cookies` to manage authentication tokens.
 * `cookies()` is async as of Next 15, so every accessor awaits it.
 *
 * `set` and `remove` throw when called from a Server Component (only
 * route handlers and Server Actions may write cookies). Middleware
 * refreshes the session on every request, so swallowing that error here
 * is safe.
 *
 * @returns The Supabase client.
 */
export function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookieStore = await cookies()
          return cookieStore.get(name)?.value ?? null
        },
        async set(name: string, value: string, options: CookieOptions) {
          try {
            const cookieStore = await cookies()
            cookieStore.set({ name, value, ...options })
          } catch {
            // Called from a Server Component — middleware handles the refresh.
          }
        },
        async remove(name: string, options: CookieOptions) {
          try {
            const cookieStore = await cookies()
            cookieStore.set({ name, value: '', ...options })
          } catch {
            // Called from a Server Component — middleware handles the refresh.
          }
        },
      },
    }
  )
}
