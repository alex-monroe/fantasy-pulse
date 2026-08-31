# Demo Mode

Roster Loom's scoreboard only comes alive during the NFL season and, for
live scoring, only while games are being played on Sunday. **Demo mode**
lets you exercise the full experience — web and mobile — any time, with
deterministic fake data that looks like a Sunday mid-slate: many active
teams, full rosters, live game clocks, and scores that climb every ~30s.

It swaps only the *data source*. Routing, team-building fan-out shape,
player grouping, the matchup report, `PlayerCard`, score-change
animations, and both UIs all run the real production code.

## How it works

Every rendered scoreboard — the web first paint, the web **Refresh**
button, and the mobile app — funnels through one function,
`getTeams()` in `apps/web/src/app/actions.ts`. In demo mode `getTeams()`
short-circuits and returns `generateDemoTeams(Date.now())` from
`@roster-loom/core`, skipping every provider and external call. Because the mobile app fetches teams from the
web app's `/api/teams/refresh` endpoint (which also calls `getTeams()`),
it gets demo data for free.

- **Generator:** `packages/core/src/demo-data.ts`. Pure and deterministic
  in the current time: roster composition, names, and opponents are fixed;
  only scores, game clocks, quarters, and pregame → in_progress → final
  transitions move as time advances. A full simulated slate is compressed
  into `DEMO_SLATE_CYCLE_MS` (15 minutes) and loops, so you see the whole
  arc within a short session. Stars are reused across teams so the "on N
  teams" badges and the Fantasy Heroes / Public Enemies / Double Agents
  report populate.
- **Auto-refresh:** in demo mode the web `HomePage` and the mobile
  `TeamsProvider` poll the refresh path every 30s so scores visibly update.

## Turning it on

Demo mode is enabled by any of these (broadest first):

| Scope | How | Applies to |
| ----- | --- | ---------- |
| Whole instance | `DEMO_MODE=1` env var on the web server | web render + refresh route + any mobile app pointing at it |
| Browser session | Visit any page with `?demo=1` (clear with `?demo=0`) | that browser only; persisted in the `rl_demo` cookie |
| Mobile build | `EXPO_PUBLIC_DEMO_MODE=1` in `apps/mobile/.env.local` | that build (sends the `x-demo-mode` header) |

### Demo mode and the login gate

The three switches are deliberately **not** equivalent where auth is
concerned:

- **`DEMO_MODE=1` bypasses the login gate entirely.** An instance
  configured that way exists only to serve fake data, so requiring an
  account buys nothing — and skipping it is what makes a clean clone
  runnable with no credentials at all.
- **`?demo=1` and `x-demo-mode` stay behind the login gate.** On a real
  deployment nobody should reach a scoreboard by appending a query
  param, so these opt-ins only change the data source for someone who
  is already signed in (use the test account in
  [CLAUDE.md](../CLAUDE.md) → Critical Rules).

Either way demo mode needs **no** connected integrations. Whenever demo
data is being served, the scoreboard shows a "Demo data" banner so it is
never mistaken for live scoring.

### Quickest local run

```bash
# Web — no Supabase credentials and no account needed
DEMO_MODE=1 npm run dev            # then open http://localhost:9002
# or, signed in already, leave DEMO_MODE unset and open http://localhost:9002/?demo=1

# Mobile (point EXPO_PUBLIC_API_URL at your web app first)
EXPO_PUBLIC_DEMO_MODE=1 npm run mobile
```

## PR preview builds

The `mobile-preview.yml` workflow publishes an `eas update` bundle for
every PR that touches `apps/mobile/**` or `packages/core/**` and posts a
QR code to the PR. Those bundles are built with `EXPO_PUBLIC_DEMO_MODE=1`
and point at production web, so **every mobile PR preview runs in demo
mode** — reviewers can scan the QR and see a live-looking scoreboard
without an in-season Sunday or connected leagues. Production App Store /
TestFlight builds are unaffected (they don't set the flag).

## Real headshots

Demo players use reliable initials-avatar placeholders. To show real
Sleeper photos, set the `sleeperId` field on entries in `PLAYER_POOL`
(`packages/core/src/demo-data.ts`); the generator will build the real
`sleepercdn.com` headshot URL automatically.
