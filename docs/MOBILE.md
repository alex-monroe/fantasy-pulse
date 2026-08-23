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
│   └── (tabs)/              # Authenticated tabs (wrapped in TeamsProvider)
│       ├── _layout.tsx      # Redirects to /login if no session; declares tabs
│       ├── index.tsx        # Overview: weekly matchups + grouped My/Opponent players
│       └── report.tsx       # Matchup Report: Fantasy Heroes / Public Enemies / Double Agents
├── lib/
│   ├── supabase.ts          # Supabase client (AsyncStorage session storage)
│   ├── session.tsx          # SessionProvider + useSession() hook
│   ├── teams.tsx            # TeamsProvider + useTeams() — shared team fetch across tabs
│   └── api.ts               # fetchTeams() → web /api/teams/refresh (Bearer JWT)
├── components/
│   ├── player-row.tsx       # Shared aggregated-player row (avatar, dots, status, score)
│   └── ...                  # Scaffolded UI primitives (Themed*, IconSymbol, etc.)
├── hooks/, constants/       # Color scheme, theme tokens
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
npx eas-cli login                        # if you haven't already
npx eas-cli init                         # creates the EAS project, writes
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

## Submitting to the App Store (iOS)

Single-source runbook. Each step is "you do this once," not part of a
recurring workflow. Order matters — Apple's UI assumes the previous
step is done.

### Phase 1 — Prereqs (do once, mostly Apple's web UI)

1. **Apple Developer Program** must be active. Enroll at
   [developer.apple.com/enroll](https://developer.apple.com/enroll).
   $99/yr. Individual account is fine; Organization requires DUNS.
   Allow 24–48h for Apple to activate.
2. **Bundle identifier** — already configured as `com.rosterloom.app`
   in `apps/mobile/app.json`. Do not change it after the first submission.
3. **App Store Connect app record.** In
   [App Store Connect](https://appstoreconnect.apple.com) → **Apps** →
   **+** → **New App**:
   - Platform: iOS
   - Name: Roster Loom
   - Primary Language: English (U.S.)
   - Bundle ID: com.rosterloom.app
   - SKU: any unique string, e.g. `rosterloom-ios-001`
4. **App Store Connect API key** (for `eas submit` to upload builds
   non-interactively). In ASC → **Users and Access** → **Integrations**
   → **App Store Connect API** → **+**:
   - Name: `eas-cli`
   - Access: **App Manager**
   - Download the `.p8` file (you only get to download it once; store
     it somewhere safe like 1Password)
   - Copy the **Key ID** and **Issuer ID** shown on the page

### Phase 2 — First TestFlight build (your laptop)

```bash
cd apps/mobile
npx eas-cli login            # if not already authenticated
npx eas-cli credentials      # one-time: let EAS generate the iOS
                             # distribution certificate + provisioning
                             # profile. Select 'Build credentials',
                             # 'production', 'iOS', and let EAS create
                             # everything automatically. EAS stores
                             # these on its servers.
npx eas-cli build --profile production --platform ios
                             # ~15-20 min. EAS uploads the build to
                             # App Store Connect automatically when done.
```

While the build runs, in App Store Connect → your app → **TestFlight**:
- Wait for the build to appear with status "Processing" (~5 min after
  EAS finishes uploading), then "Ready to Test."
- Apple will email you about an export-compliance question — answer
  "no, my app does not use non-exempt encryption" (matches the
  `ITSAppUsesNonExemptEncryption: false` we set in `app.json`).

Then submit it:

```bash
npx eas-cli submit --profile production --platform ios
# First run: EAS prompts for ASC API Key ID, Issuer ID, and the .p8
# file path. Paste/select them. EAS writes the IDs back into eas.json
# (the .p8 contents are stored on EAS's servers; don't commit them).
```

Install on your phone: open **TestFlight** app on iOS → accept the
invite → install. Sign in, scoreboard should render with real data.

### Phase 3 — App Store metadata + review (App Store Connect)

In ASC → your app → **App Store** tab:
- **App Information**
  - Category: Sports
  - Privacy Policy URL: `https://www.rosterloom.com/privacy`
- **Pricing and Availability**: Free, all territories
- **App Privacy** (`Manage` next to Data Collected):
  - Email Address — linked to user, used for App Functionality
  - User ID (Supabase user UUID) — linked to user, App Functionality
  - Other Auth Tokens (provider OAuth tokens) — linked to user,
    App Functionality, **not** shared with third parties
  - No tracking
- **Age Rating**: 4+ (no objectionable content)
- **Version metadata**:
  - Description: short marketing copy (one paragraph)
  - Keywords: comma-separated, e.g. "fantasy football, sleeper, yahoo,
    ottoneu, scoreboard, NFL"
  - Support URL: `https://www.rosterloom.com` (works until we add a
    dedicated /support page)
  - Marketing URL: same as Support
- **Screenshots**: minimum 3 for **6.5"** and **6.7"** display sizes.
  Take them from your phone via TestFlight (Screenshots in the
  Photos app, or use Xcode → Devices and Simulators). Login screen,
  scoreboard collapsed, scoreboard expanded with players.
- **Build**: Select the TestFlight build from Phase 2.
- **App Review Information**:
  - Sign-in credentials: provide a test account (e.g.
    `test@test.com` / `testtest`) so Apple reviewers can log in.

Hit **Submit for Review**. Apple typically takes 1–3 business days.
Common rejection reasons to pre-empt:
- **Sign in with Apple required**: only triggers if you offer
  third-party login (Google/Facebook). We use email/password only,
  so we're exempt.
- **Broken state**: make sure the test account has at least one
  connected integration so reviewers see a non-empty scoreboard.

### Subsequent releases

```bash
# Bump the version in apps/mobile/app.json (e.g. 0.1.0 → 0.2.0)
# buildNumber auto-increments via eas.json autoIncrement: true.
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios
# Then in ASC, create a new version, fill in "What's new in this
# version," select the new build, and submit for review.
```

Or trigger the **Mobile Release (TestFlight)** GitHub Action
(`.github/workflows/mobile-release.yml`, `workflow_dispatch` only) from
the Actions tab — it runs the same build + submit steps in CI using the
`EXPO_TOKEN` secret and the credentials already stored on EAS's servers.
It auto-increments the minor version in `app.json` (e.g. 0.2.0 → 0.3.0)
and commits that bump back to the branch before building, so there's
nothing to bump by hand first.

## What's not here yet

- **Integration management on mobile.** Connecting or removing Sleeper,
  Yahoo, and Ottoneu accounts still happens on the web app; the mobile app
  reads the resulting teams via `/api/teams/refresh`. The read-side views
  (Overview scoreboard, Matchup Report) are at parity with web — the
  connect flows are the remaining gap. See the Sleeper/Ottoneu server
  actions under `apps/web/src/app/integrations/` for what a mobile port
  would need to call.
- **Yahoo OAuth on mobile.** The OAuth flow on web uses the
  `localhost:9002` redirect; mobile will need `expo-auth-session` with
  the `rosterloom://` scheme. Not wired up yet.
- **Custom dev client.** Not needed while every native module we use
  ships with Expo Go. The first time we add a module that doesn't
  (likely candidates: push notifications, certain auth/payment SDKs),
  we'll need to publish a one-time custom dev build via
  `eas build --profile preview`.
- **Android Play Store submission.** Same structure as iOS but
  different signing model and console. Coming in a follow-up.
