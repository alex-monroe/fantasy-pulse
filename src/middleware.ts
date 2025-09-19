import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_ROUTES = ['/login', '/register'] as const
const HOME_ROUTE = '/'
const LOGIN_ROUTE = '/login'

const isAuthRoute = (pathname: string) =>
  AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

const isStaticAsset = (pathname: string) => /\.[^/]+$/.test(pathname)

const redirectWithCookies = (url: URL, baseResponse: NextResponse) => {
  const response = NextResponse.redirect(url)

  for (const cookie of baseResponse.cookies.getAll()) {
    response.cookies.set(cookie)
  }

  return response
}

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api') || isStaticAsset(pathname)) {
    return response
  }

  if (!user && !isAuthRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = LOGIN_ROUTE
    redirectUrl.search = ''

    return redirectWithCookies(redirectUrl, response)
  }

  if (user && isAuthRoute(pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = HOME_ROUTE
    redirectUrl.search = ''

    return redirectWithCookies(redirectUrl, response)
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
