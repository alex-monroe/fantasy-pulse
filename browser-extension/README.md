# Roster Loom Connector (Chrome extension)

A zero-dependency Manifest V3 extension that reads the two ESPN cookies
Roster Loom's private-league integration needs — `espn_s2` and `SWID` —
and copies them to the clipboard, so users don't have to walk the DevTools
path described in
[`apps/web/src/app/integrations/espn/README.md`](../apps/web/src/app/integrations/espn/README.md).

It is a **clipboard helper and nothing else**. It makes no network
requests, has no content scripts, no service worker, and no access to any
site other than `espn.com`. That is a deliberate design constraint, not an
accident: see [Chrome Web Store review](#chrome-web-store-review) below.

## What the user sees

Click the toolbar icon while signed in to ESPN and the popup shows up to
three rows, each masked with a **Show** toggle and a copy button:

| Row         | Source                                          |
| ----------- | ----------------------------------------------- |
| League ID   | `leagueId` in the active tab's URL, when present |
| `espn_s2`   | cookie on `espn.com`                             |
| `SWID`      | cookie on `espn.com`                             |

Those are exactly the three fields on `/integrations/espn`.

If no ESPN session is found, the popup says so and links to ESPN's sign-in
rather than showing empty fields.

## Value handling

Two normalizations matter, and both mirror what the server does with the
values afterwards (`connectEspn` in
[`integrations/espn/actions.ts`](../apps/web/src/app/integrations/espn/actions.ts)):

- **`espn_s2` is copied verbatim, never percent-decoded.** It goes back to
  ESPN as-is inside a `Cookie` header; decoding its `%2B` / `%2F` escapes
  produces a token ESPN rejects.
- **`SWID` is percent-decoded and wrapped in exactly one pair of braces.**
  Chrome sometimes stores it as `%7BGUID%7D`. Pasting that in would survive
  the server's own `normalizeSwid` as a double-wrapped `{%7BGUID%7D}`.

When a cookie name resolves to more than one cookie (a stale host-only copy
on `fantasy.espn.com` can linger past a sign-out and shadow the live one on
`.espn.com`), `pickCookie` prefers the broadest domain, then the longest value.

## Layout

```
browser-extension/
├── manifest.json          # MV3 manifest — permissions live here
├── popup.html/.css/.js    # the entire UI
├── espn-cookies.js        # pure helpers (no chrome.*, no DOM)
├── espn-cookies.test.js   # node --test, no test framework needed
├── icons/                 # generated from apps/web/public/android-chrome-512x512.png
├── package.sh             # builds the Web Store upload zip
├── PRIVACY.md             # privacy policy source (must be published at a URL)
└── STORE_LISTING.md       # listing copy + permission justifications
```

This directory is intentionally **outside** the `apps/*` / `packages/*` npm
workspace globs. It has no dependencies and no build step, so keeping it out
of the workspace leaves `package-lock.json` and the web/mobile CI untouched.
Its `.js` files are shipped to the browser unbundled, which is why the
"no new `.js` files" rule in [AGENTS.md](../AGENTS.md) (scoped to
`apps/web/src/`) doesn't apply here.

## Development

```bash
cd browser-extension
npm test            # node --test — the pure helpers in espn-cookies.js
./package.sh        # -> roster-loom-connector-<version>.zip
```

`npm test` here is separate from the repo's root `npm test`; the root script
only runs Jest in `apps/web` and `apps/mobile`.

Load it unpacked to try it:

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this directory
3. Sign in at [fantasy.espn.com](https://fantasy.espn.com), open a league,
   click the extension icon

To regenerate the icons after a brand change:

```bash
# any 512x512 source works; there is no image toolchain dependency in CI
node scripts/resize-icons.cjs ../apps/web/public/android-chrome-512x512.png icons
```

## Chrome Web Store review

Short version: **yes, this is publishable** — reading cookies is a
documented, supported API and cookie-reading extensions are a long-standing
category. But `espn_s2` and `SWID` are authentication credentials, which
Google classifies as *personal or sensitive user data*, so this extension
lands in the most heavily scrutinized tier of review. The full analysis,
the permission justifications to paste into the dashboard, and the
submission checklist are in [STORE_LISTING.md](STORE_LISTING.md).

The design rules that keep it on the right side of the line:

1. **No network code at all.** No `fetch`, no `XMLHttpRequest`, no
   analytics, no remote config. An extension that reads an auth cookie and
   then talks to a server is indistinguishable from credential exfiltration
   to an automated scanner — and to a human reviewer.
2. **Two permissions, both load-bearing.** `cookies` plus
   `https://*.espn.com/*`. Nothing is requested that the code doesn't use,
   which is the single most common cause of permission-policy rejections.
3. **One purpose.** Copy ESPN fantasy session values. No bundled scoreboard,
   no auto-fill, no "while we're here" features.
4. **No ESPN branding.** The name is "Roster Loom Connector", the word ESPN
   appears descriptively, and the popup carries a
   "Not affiliated with, endorsed by, or sponsored by ESPN" disclaimer.

If those constraints ever need to bend — say, auto-filling the values into
rosterloom.com instead of using the clipboard — re-read STORE_LISTING.md
first. That specific change is the one most likely to turn an approval into
a rejection.
