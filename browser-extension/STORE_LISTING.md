# Chrome Web Store submission

Listing copy, permission justifications, and the policy reasoning behind
this extension's design. Read this before changing `manifest.json`.

> These notes reflect Chrome Web Store policy as researched on 2026-09-13.
> Policy text changes; confirm against the live
> [Program Policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
> before submitting.

---

## Will this be allowed?

**Yes, with conditions.** Nothing in Chrome Web Store policy prohibits
reading cookies. `chrome.cookies` is a documented, supported extension API,
and cookie readers, session managers, and cookie editors are a
long-established published category.

The catch is that `espn_s2` and `SWID` are *authentication credentials*.
Chrome Web Store's user data policy explicitly names **authentication
information** as "personal or sensitive user data", which pulls this
extension into the strictest tier of review: privacy policy required,
secure-handling required, Limited Use required, and a slower, more likely
manual review.

That's a compliance burden, not a blocker. The extension is built so that
every one of those requirements has a trivially true answer.

### The policies that actually apply

| Policy | How this extension satisfies it |
| ------ | ------------------------------- |
| **Single purpose** — an extension must have one narrow, easy-to-understand purpose | Its only function is copying your own ESPN fantasy session values to the clipboard. No bundled scoreboard, no cookie editing, no second feature. |
| **Minimum permissions** — request only what the code uses; unused permissions are among the most common rejection causes | Exactly two: `cookies` and `https://*.espn.com/*`. Both are used on every popup open. No `tabs`, no `activeTab`, no `storage`, no `scripting`, no `<all_urls>`. |
| **User data privacy** — post a privacy policy, disclose handling, handle securely | [PRIVACY.md](PRIVACY.md), published at a public URL. Values never leave the device, so "handled securely in transit" is satisfied vacuously. |
| **Limited Use** — use data only for the user-facing feature; no unconsented transfer, no sale, no ads, no human review | The data is used for exactly one thing, in front of the user, on their explicit click, and is never transmitted. |
| **No remote code** (Manifest V3) | All code ships in the package. No `eval`, no remotely hosted scripts, no remote config. The CSP is declared explicitly in the manifest. |
| **Impersonation & intellectual property** | Named "Roster Loom Connector", not "ESPN ...". No ESPN logos or trade dress. "ESPN" appears descriptively, with a disclaimer in the popup and the listing. |
| **Accurate metadata** | The description states exactly what it does, including that it reads cookies. |

### What would get this rejected

In rough order of risk:

1. **Adding any network call.** An extension that reads an auth cookie and
   then contacts a server matches the exfiltration pattern that automated
   malware scanners and human reviewers are specifically hunting for. Even
   innocent analytics would do it. This is the constraint to defend.
2. **Auto-filling the values into rosterloom.com** instead of the
   clipboard. It's a genuinely nicer UX, and it is a much harder sell: it
   needs host permission for rosterloom.com, and it turns "the user copies
   their own credential" into "the extension moves a credential between two
   sites". Doable, but expect real scrutiny and a longer review. If you
   want it, ship the clipboard version first and establish a track record.
3. **Requesting permissions the code doesn't use.** Reviewers diff the
   manifest against the source. An unused `storage` or `tabs` entry is a
   straightforward violation.
4. **Broadening host permissions** to `<all_urls>` or `*://*/*`.
5. **A missing, 404ing, or placeholder privacy policy URL.** The review
   bots fetch it.
6. **Leading the extension name with "ESPN"**, or using ESPN's logo, which
   invites an impersonation/IP flag.
7. **Bundling a second feature**, which breaks single purpose.

### What to expect from review

Budget days, not hours. Extensions requesting sensitive permissions get
slower review, and cookie access on a named domain qualifies. A first
submission that draws a manual reviewer is normal here, not a bad sign.

### The other question: ESPN's terms

Separate from Google, and worth being clear-eyed about. The extension only
surfaces a credential the user's own browser already holds, which is what
the third-party ESPN fantasy tooling ecosystem has done for over a decade
(and what Roster Loom already asks users to do by hand through DevTools —
this just removes the DevTools step). ESPN has historically tolerated it.
Google doesn't adjudicate this, but it would act on a valid IP or
takedown complaint, so the no-branding, no-affiliation-implied posture is
doing real work.

---

## Listing copy

**Name**

```
Roster Loom Connector
```

**Short description** (132 char limit)

```
Copies your own ESPN fantasy session values (espn_s2, SWID) to the clipboard so you can connect a private league to Roster Loom.
```

**Detailed description**

```
Roster Loom Connector removes the DevTools step from connecting a private
ESPN fantasy football league to Roster Loom.

ESPN offers no public API and no sign-in for third-party apps, so every
tool that reads your private league — Roster Loom included — authenticates
with two values ESPN stores in your browser: espn_s2 and SWID. Normally you
have to open DevTools, find the Cookies panel, and copy them by hand.

This extension shows them instead. Sign in to ESPN, click the icon, and
copy each value with one click. If you're on a league page, it picks up
your league ID too.

WHAT IT DOES NOT DO

This extension makes no network requests. None. Your ESPN values are shown
in the popup and copied to your clipboard when you ask for it, and that is
the end of their journey — they are never sent anywhere, stored anywhere,
or logged anywhere. There is no analytics, no telemetry, and no account.

It also has no access to any website other than espn.com. It cannot read
your other tabs, your other cookies, or the contents of any page.

Values are masked in the popup until you press "Show", so a screen-share
doesn't leak your session.

Roster Loom Connector is not affiliated with, endorsed by, or sponsored by
ESPN, Inc. or The Walt Disney Company.
```

**Category:** Sports (alternative: Workflow & Planning)

**Privacy policy URL:** `https://www.rosterloom.com/privacy` — must cover
the extension, or publish [PRIVACY.md](PRIVACY.md) at its own URL and link
that instead.

**Support / homepage URL:** `https://www.rosterloom.com`

---

## Permission justifications

Paste these into the dashboard's **Privacy practices** tab. Each field has
its own box; reviewers read them against the source.

**`cookies`**

```
The extension's single purpose is to show the user their own ESPN fantasy
session values, espn_s2 and SWID, so they can copy them into Roster Loom
to connect a private league. Reading those two cookies is the entire
function. They are read only while the popup is open, displayed masked,
and copied to the clipboard on an explicit user click. They are never
transmitted — the extension contains no networking code.
```

**Host permission `https://*.espn.com/*`**

```
This scopes the cookie access above to ESPN only, so the extension cannot
read cookies for any other site. It also lets the popup read the leagueId
parameter from the URL of an ESPN tab the user already has open, so the
user doesn't have to find their league ID by hand. No content scripts are
injected and no page content is read. This is the narrowest host pattern
that covers ESPN's fantasy subdomains.
```

**Single purpose description**

```
Read the current user's own ESPN authentication cookies (espn_s2 and SWID)
from their browser and let them copy those values to the clipboard for use
in Roster Loom's ESPN league integration.
```

**Data usage certifications**

- Does your extension collect or transmit user data? → **No**
- Sell to third parties → **No**
- Use or transfer for purposes unrelated to the single purpose → **No**
- Use or transfer to determine creditworthiness / for lending → **No**

---

## Pre-submission checklist

- [ ] `./package.sh` runs clean and the zip contains exactly 9 files — no
      tests, no docs, no source maps
- [ ] `grep -rE "fetch\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket" *.js` returns nothing
- [ ] `manifest.json` permissions match what the code actually calls
- [ ] Privacy policy URL loads publicly (no redirect loop, no 404)
- [ ] Developer account email verified; publisher domain verified so the
      listing shows rosterloom.com
- [ ] Screenshots: 1280×800 or 640×400, showing the popup — blur or use a
      throwaway account, since screenshots of a real session leak it
- [ ] Version bumped in `manifest.json` (the store rejects re-uploads of an
      existing version)
