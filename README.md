# Fantasy Pulse

Fantasy Pulse is a Next.js application for tracking fantasy football matchups.  
The project uses the App Router and Supabase for authentication and data storage.

To get started, take a look at `src/app/page.tsx`.

## Architecture

The codebase is split between server-side and client-side modules.

### Server-side

- Files in `src/app` are server components by default. Server actions such as
  `src/app/actions.ts` fetch data from Supabase and the Sleeper API.
- API routes under `src/app/api/**` run as serverless functions. For example,
  `src/app/api/auth/yahoo/route.ts` handles OAuth callbacks from Yahoo.
- `src/middleware.ts` executes on the server to keep Supabase session cookies in sync.
- Utilities like `src/utils/supabase/server.ts` create authenticated Supabase
  clients for server code.

### Client-side

- Interactive components live in `src/components` and use the "use client"
  directive (e.g. `src/components/home-page.tsx`).
- Custom hooks in `src/hooks` and the browser Supabase client in
  `src/utils/supabase/client.ts` run only in the browser.
- Pages that import client components, such as `/login` or `/integrations`,
  execute on the client for user interactions.

## Supabase Auth

This project uses [Supabase](https://supabase.com) for authentication. Provide the following environment variables to enable the login flow:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

You can sign in at `/login` with an email and password, sign up for a new account at `/register`, and sign out from the main page header.

## To Do

* update live game states
* fix player lookup with "Jr" or "III" in name
* update favicon
