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

## Per-PR previews (EAS Update + Expo Go)

Every PR that touches `apps/mobile/**` or `packages/core/**` triggers
`.github/workflows/mobile-preview.yml`, which:

1. Publishes a JavaScript-only update to a PR-specific EAS Update
   channel (`pr-<number>`).
2. Posts a comment on the PR with a QR code.

To view the preview: open **Expo Go** on your phone, tap "Scan QR code,"
point at the QR in the PR comment. Expo Go fetches that PR's bundle
and runs it.

JavaScript-only changes (UI, business logic, data fetching) ship via
EAS Update — instant, free. Native module changes would require a
full `eas build`; we don't have any of those yet, so every PR can use
the Update path.

### One-time setup (required for the workflow to actually publish)

These two steps must be done once by a maintainer; nothing in CI can
do them automatically.

**1. Bind the app to an EAS project.** From the repo root:

```bash
cd apps/mobile
npx eas login                        # if you haven't already
npx eas init                         # creates the EAS project, writes
                                     # extra.eas.projectId and
                                     # updates.url into app.json
```

Commit the resulting `app.json` change.

**2. Add `EXPO_TOKEN` to GitHub Secrets.** Go to
[expo.dev → Account Settings → Access Tokens](https://expo.dev/accounts/[username]/settings/access-tokens),
create a token named `github-actions`, copy it. Then in this repo:
**Settings → Secrets and variables → Actions → New repository secret**,
name `EXPO_TOKEN`, paste the token value.

After those two steps land, the next PR will get a QR-code comment.

## What's not here yet

- **Yahoo OAuth on mobile.** The OAuth flow on web uses the
  `localhost:9002` redirect; mobile will need `expo-auth-session` with
  the `rosterloom://` scheme. Not wired up yet.
- **Custom dev client / `eas build`.** Not needed while every native
  module we use ships with Expo Go. The first time we add a module
  that doesn't (likely candidates: push notifications, certain
  auth/payment SDKs), we'll need to publish a one-time custom dev
  build via `eas build --profile preview`. That's when the Apple
  Developer account becomes load-bearing.
- **Production releases.** No `eas build --profile production` /
  `eas submit` workflow yet.
