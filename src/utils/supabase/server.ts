import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          const cookieStore = cookies()
          return (await cookieStore.get(name)?.value) || null
        },
        async set(name: string, value: string, options: CookieOptions) {
          const cookieStore = cookies()
          await cookieStore.set({ name, value, ...options })
        },
        async remove(name: string, options: CookieOptions) {
          const cookieStore = cookies()
          await cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}
