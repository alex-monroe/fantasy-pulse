# Authentication

Roster Loom's accounts are Supabase Auth email/password accounts. There
is no social login and no custom user table — `auth.users` is the
account, and every `fp_` table keys off `auth.uid()` through RLS.

| Route | What it does |
| ----- | ------------ |
| `/register` | `signUp` with email + password, then sends you to `/login` |
| `/login` | `signInWithPassword`, then to `?next=` (a same-origin path) or `/` |
| `/forgot-password` | `resetPasswordForEmail` — sends a recovery link |
| `/auth/callback` | Turns an emailed token into a session cookie |
| `/reset-password` | `updateUser({ password })` on that session |

`middleware.ts` refreshes the session cookie on every matched request;
the Supabase clients themselves live in `apps/web/src/utils/supabase/`.

## The password reset flow

1. **`/forgot-password`** takes an email address and calls
   `resetPasswordForEmail(email, { redirectTo })`, where `redirectTo` is
   `<origin>/auth/callback?next=/reset-password`.

   The confirmation screen is identical whether or not an account
   exists. Supabase deliberately doesn't report "no such user" here, and
   neither do we — otherwise the form doubles as a way to enumerate who
   has an account. Errors that *are* shown (rate limits, SMTP failures)
   say nothing about the address.

2. **Supabase emails the link.** It points at Supabase's `/auth/v1/verify`,
   which validates the token and then redirects the browser to
   `redirectTo` — so `redirectTo` must be on the project's allowlist
   (see [Supabase configuration](#supabase-configuration) below).

3. **`/auth/callback`** exchanges what the link carries for a session
   cookie and forwards to `next`. It accepts both shapes Supabase can
   send (see [Two link shapes](#two-link-shapes)), and `next` is run
   through `safeRedirectPath` so the route can't be used as an open
   redirect. A bad or spent link redirects to `/login?error=invalid_link`
   — an error *code*, never a message taken from the URL, so nobody can
   put their own text on our login page.

4. **`/reset-password`** collects the new password and calls
   `updateUser({ password })`. Holding the session *is* the
   authorization: Supabase only issues it to whoever opened the link.
   Landing there without one (expired link, different browser, stale
   bookmark) shows a "request a new link" screen rather than a form that
   could only fail.

Links are single-use and expire after an hour.

## Two link shapes

Which one you get depends on the email template, and `/auth/callback`
handles both:

- **`?code=…` (default).** The PKCE flow. The code verifier was written
  to a cookie when the reset was requested, so the exchange only works
  in the same browser. Click the link on your phone after requesting it
  on your laptop and it fails — correctly, but confusingly.
- **`?token_hash=…&type=recovery`.** Emitted when the template uses
  `{{ .TokenHash }}`. No verifier is involved, so the link works on any
  device. Preferred if you have dashboard access to change it.

## Supabase configuration

Auth settings live on the shared **OttoneuDB** project, so changes
affect the sibling repo's app too — check before editing anything that
isn't listed here.

- **Redirect URLs** (Authentication → URL Configuration) must include
  every origin that sends reset emails, or Supabase drops `redirectTo`
  and falls back to the Site URL:
  - `http://localhost:9002/**` (the dev port — not 3000)
  - the production origin, e.g. `https://<app>.vercel.app/**`
- **Password minimum** is six characters; `/reset-password` checks the
  same minimum client-side so a short password fails instantly instead
  of after a round trip.
- **Recovery email template** (Authentication → Email Templates →
  Reset Password), to get the device-independent link:

  ```html
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
    Reset your password
  </a>
  ```

  Leaving the default `{{ .ConfirmationURL }}` template alone also
  works — that's the `?code=` path above.

## Mobile

`apps/mobile` signs in with the same Supabase project but has no reset
flow of its own: a recovery link would need deep linking back into the
Expo app, and the emailed link's code verifier lives in whichever client
requested it. Mobile users reset from the web app.

## Tests

- `apps/web/src/app/forgot-password/page.test.tsx`
- `apps/web/src/app/reset-password/page.test.tsx`
- `apps/web/src/app/auth/callback/route.test.ts`
- `apps/web/src/lib/safe-redirect.test.ts`
- `apps/web/e2e/forgot-password.spec.ts` (CI only — see
  [TESTING.md](TESTING.md))

The e2e spec stubs Supabase's `/auth/v1/recover` endpoint: the real one
sends mail through the shared project and is rate limited per hour.
