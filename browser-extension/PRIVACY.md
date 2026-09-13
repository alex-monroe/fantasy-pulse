# Roster Loom Connector — Privacy Policy

_Last updated: 2026-09-13_

Roster Loom Connector is a browser extension that reads two cookies ESPN
has already stored in your own browser — `espn_s2` and `SWID` — and lets
you copy them to your clipboard so you can paste them into Roster Loom.

## What the extension collects

**Nothing.** The extension has no servers, no analytics, no telemetry, and
no error reporting. It contains no code that makes network requests of any
kind.

## What the extension accesses

While its popup is open, the extension reads:

- the `espn_s2` and `SWID` cookies stored for `espn.com` in your browser
- the address of the currently active tab, but only when that tab is on
  `espn.com`, and only to pick your ESPN league ID out of the URL

These values are displayed in the popup (masked until you choose to reveal
them) and written to your clipboard when you press a copy button. They are
held in the popup's memory only while the popup is open, and are discarded
when it closes. They are never stored, logged, or transmitted anywhere.

The extension cannot read cookies, page content, or tab addresses for any
site other than `espn.com`. Its permissions do not allow it.

## Your clipboard

When you press a copy button, the value goes to your system clipboard. What
happens to it after that is governed by your operating system and whatever
you paste it into. Paste it into Roster Loom's ESPN connect page and it is
then covered by the [Roster Loom privacy policy](https://www.rosterloom.com/privacy).

## Permissions and why they exist

| Permission               | Why it's needed                                                        |
| ------------------------ | ---------------------------------------------------------------------- |
| `cookies`                | To read the `espn_s2` and `SWID` values — the extension's whole purpose |
| `https://*.espn.com/*`   | Scopes that cookie access to ESPN, and lets the popup read the league ID from an ESPN tab's URL |

No other permissions are requested. The extension has no host access to any
other domain, including rosterloom.com.

## Data sharing and sale

The extension collects no data, so there is none to share or sell. It does
not transfer user data to third parties, does not use it for advertising or
creditworthiness, and no human reads it.

## Changes

Material changes to this policy will be published here and reflected in the
extension's Chrome Web Store listing before taking effect.

## Contact

<support@rosterloom.com>

## Not affiliated with ESPN

Roster Loom Connector is not affiliated with, endorsed by, or sponsored by
ESPN, Inc. or The Walt Disney Company. "ESPN" is used only to describe which
site the extension works with.
