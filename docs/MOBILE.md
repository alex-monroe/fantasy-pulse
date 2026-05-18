# Mobile app (`apps/mobile/`)

Expo / React Native app sharing `@roster-loom/core` with the web app.
First-run guide for getting it on a real phone.

## Prereqs (one-time)

- **Expo Go** on your phone — install from the App Store (iOS) or Play
  Store (Android). Free, no account needed for local development.
- Same Wi-Fi network as the dev machine, or use the `--tunnel` flag.
- Node 20.x (`nvm use` from the repo root).

## Env vars

Mobile uses `EXPO_PUBLIC_*` variables (Expo inlines them into the JS
bundle at build time). Copy the template and fill in the same Supabase
values you use in `apps/web/.env.local`:

```bash
cp apps/mobile/.env.example apps/mobile/.env.local
# Then edit and paste:
# EXPO_PUBLIC_SUPABASE_URL=...   (same value as NEXT_PUBLIC_SUPABASE_URL)
# EXPO_PUBLIC_SUPABASE_ANON_KEY=... (same value as NEXT_PUBLIC_SUPABASE_ANON_KEY)
```

The mobile app talks directly to Supabase using the anon key + RLS
policies — no separate auth backend.

## Running locally

From the repo root:

```bash
npm run mobile
```

That launches the Expo dev server. A QR code appears in the terminal.
On the phone:

- **iOS** — open the Camera app, point at the QR code, tap the
  notification that says "Open in Expo Go."
- **Android** — open Expo Go, tap "Scan QR code."

The app builds, transfers, and opens. Edit any file in `apps/mobile/`;
hot reload kicks in within a second or two.

If Wi-Fi can't reach the dev machine (corporate net, hotel, etc.):

```bash
npm run mobile -- --tunnel
```

This routes through Expo's relay; slower but works anywhere.

## Project layout

```
apps/mobile/
├── app/                     # Expo Router screens (file-based routing)
│   ├── _layout.tsx          # Root stack; wraps everything in SessionProvider
│   ├── login.tsx            # Sign-in screen
│   └── (tabs)/              # Authenticated tabs
│       ├── _layout.tsx      # Redirects to /login if no session
│       └── index.tsx        # Leagues list (queries fp_leagues)
├── lib/
│   ├── supabase.ts          # Supabase client (AsyncStorage session storage)
│   └── session.tsx          # SessionProvider + useSession() hook
├── components/, hooks/, constants/   # Scaffolded UI primitives (Themed*, IconSymbol, etc.)
├── __tests__/               # Jest tests (jest-expo preset)
├── app.json                 # Expo config (scheme, splash, plugins)
└── jest.config.js
```

## Tests

```bash
npm run test -w @roster-loom/mobile
```

Currently one smoke test that imports from `@roster-loom/core` to
prove the monorepo wiring resolves correctly. As we add features,
co-locate component tests with `@testing-library/react-native`.

## Sharing code with web

Anything portable lives in `packages/core/` and is imported as
`@roster-loom/core`. **Do not** add React, Next.js, or web/native-only
APIs there — that package has to compile in both environments. See
[CODE_ORGANIZATION.md](CODE_ORGANIZATION.md#what-goes-in-packagescore).

## What's not here yet

- **PR preview workflow (Phase 3).** Each PR will eventually publish
  an EAS Update channel and post a QR code as a PR comment, just like
  Vercel does for web. Until then, every PR has to be checked out
  locally and run through `npm run mobile`.
- **Yahoo OAuth on mobile.** The OAuth flow on web uses the
  `localhost:9002` redirect; mobile will need `expo-auth-session` with
  the `rosterloom://` scheme. Not wired up yet.
- **Production builds.** No `eas build` yet — see Phase 3.
