import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { DEMO_COOKIE, DEMO_QUERY_PARAM, parseDemoQueryToggle } from '@/lib/demo-mode'

/**
 * The middleware function for the application.
 * @param request - The incoming request.
 * @returns The response.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getUser()

  // `?demo=1` opts this browser into demo mode (deterministic fake data);
  // `?demo=0` clears it. Persisted in the `rl_demo` cookie so subsequent
  // renders and the /api/teams/refresh polls stay in demo mode.
  const demoToggle = parseDemoQueryToggle(
    request.nextUrl.searchParams.get(DEMO_QUERY_PARAM)
  )
  if (demoToggle === true) {
    response.cookies.set({ name: DEMO_COOKIE, value: '1', path: '/' })
  } else if (demoToggle === false) {
    response.cookies.set({ name: DEMO_COOKIE, value: '', path: '/', maxAge: 0 })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
