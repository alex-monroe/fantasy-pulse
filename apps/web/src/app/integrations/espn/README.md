# ESPN Integration

This document explains how the ESPN integration works and why it looks
different from Sleeper/Yahoo.

## Why this integration is different

ESPN has no public fantasy API and no OAuth flow. Every third-party ESPN
fantasy tool (this one included) authenticates by reusing two cookies
copied out of a logged-in browser session on espn.com:

- `espn_s2` — an opaque token, typically 250+ characters
- `SWID` — a GUID wrapped in curly braces, e.g. `{ABCD1234-...}`

Public leagues don't require these at all, but private leagues (the vast
majority) do. There's no way to mint them programmatically — ESPN's login
is behind bot detection — so the user has to copy them by hand:

1. Log in to [fantasy.espn.com](https://fantasy.espn.com) and open your league.
2. Open DevTools (`F12` or right-click → Inspect) → **Application** tab
   (Chrome/Edge) or **Storage** tab (Firefox) → **Cookies** →
   `https://fantasy.espn.com`.
3. Copy the values of `espn_s2` and `SWID` (including the curly braces).
4. Paste both into the connect form on `/integrations/espn`.

## Credential lifetime

There's no fixed expiration and no refresh endpoint. In practice:

- The pair keeps working indefinitely as long as the user stays logged in
  to ESPN and doesn't change their password.
- Logging out of ESPN, or ESPN doing an unannounced session invalidation,
  kills it — at that point ESPN starts returning `401`/`403`.

Because there's no way to proactively know when this will happen, this
integration does **not** show a countdown or expiration date. Instead,
`connectEspn` and `getEspnMatchup` both detect `401`/`403` responses and
return a "reconnect with fresh cookies" error message rather than a
generic failure, so the UI can prompt the user to repeat the steps above.

## Integration flow

1. **Authentication**: the user pastes their ESPN league ID (from the
   league's URL) plus `espn_s2` and `SWID`. `connectEspn` in `actions.ts`
   validates them against ESPN's `mTeam` view, finds the team owned by
   that `SWID` (by matching it against each team's `owners` array), and
   stores the cookie pair on the `fp_user_integrations` row (`espn_s2`,
   `swid` columns — added in
   `supabase/migrations/20260823130000_add_espn_credentials_to_user_integrations.sql`).
2. **Data fetching**: `getEspnMatchup` re-sends the stored cookies as a
   `Cookie` header on every request — ESPN takes the raw cookie pair
   itself, not a bearer token derived from it.
3. **Data storage**: the resolved league and team are upserted into
   `fp_leagues` / `fp_teams`, same as the other providers.

## Player rosters

`getEspnMatchup` requests the `mRoster` view alongside `mMatchupScore`/
`mTeam`, so each side of the current matchup includes a `players` array
(current-scoring-period roster entries). ESPN identifies each player's
position and pro team by numeric code rather than name; `actions.ts`
decodes these via `ESPN_POSITION_ABBREVIATIONS` and
`ESPN_PRO_TEAM_ABBREVIATIONS`. Those tables are reverse-engineered (not
from an official ESPN spec) and are stable across the wider ESPN
fantasy tooling ecosystem, but ESPN could change the codes without
notice — if a player's position or team ever shows up blank, that's
the first place to check.

`buildEspnTeams` in `apps/web/src/app/actions.ts` maps this roster
data into the app's shared `Player`/`Team` types (resolving headshots
via a name match against Sleeper's player list, same as the Yahoo and
Ottoneu integrations) so ESPN teams show up on the dashboard.
