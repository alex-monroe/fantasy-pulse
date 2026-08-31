# Data Flow

One request, end to end. This is the mental model everything else hangs
off: **turn four providers' different payloads into one `Team[]`, then
render it.**

## The seam

```
                    getTeams()
                         │
   ┌─────────────────────┼─────────────────────┐
   │                     │                     │
web first paint    Refresh button          mobile app
 (page.tsx)     (/api/teams/refresh)   (same endpoint, bearer JWT)
                                              │
                                        MCP server
                                        (/api/mcp)
```

`getTeams()` in `apps/web/src/app/actions.ts` is the only place teams are
assembled. Every consumer — the server-rendered home page, the browser's
Refresh button, the mobile app, the MCP tools — goes through it. Demo
mode short-circuits inside it, which is why one flag covers all four.

If you are adding a consumer, call `getTeams()`. If you are changing what
a team looks like, you change it in one place.

## One home-page render

```
GET /  →  apps/web/src/app/page.tsx            (server component)
          │
          ├─ createClient()                    utils/supabase/server.ts
          ├─ resolveDemoMode()                 lib/demo-mode.ts
          └─ getTeams()                        app/actions.ts
             │
             ├─ [demo instance?] → generateDemoTeams()   ← returns here
             │                     packages/core/src/demo-data.ts
             │
             ├─ auth check ─────────────────── 'You must be logged in.'
             │
             ├─ load fp_user_integrations for this user
             │
             ├─ getCurrentNflWeek()            lib/nfl/week.ts
             ├─ getSleeperPlayersResources()   lib/nfl/sleeper-players.ts
             │    (multi-MB Sleeper player list, cached 5 min)
             ├─ fetch ESPN scoreboard          lib/nfl/scoreboard.ts
             │    (live game clocks, one fetch shared by all providers)
             │
             ├─ Promise.all over integrations ─────────────┐
             │    buildSleeperTeams()   integrations/sleeper/build-teams.ts
             │    buildYahooTeams()     integrations/yahoo/build-teams.ts
             │    buildOttoneuTeams()   integrations/ottoneu/build-teams.ts
             │    buildEspnTeams()      integrations/espn/build-teams.ts
             │                                              │
             ├─ annotate players with game info ────────────┘
             ├─ count cross-team player shares
             └─ Team[]
          │
          └─ <HomePage teams={...} />          components/home-page.tsx
                 ├─ league-scoreboard.tsx      per-league matchup rail
                 └─ player-board.tsx → player-card.tsx
```

## Where the work happens

| Concern | Lives in |
| ------- | -------- |
| Orchestration, fan-out, share counting | `app/actions.ts` |
| Provider API calls + DB writes | `integrations/<provider>/actions.ts` |
| Provider payload → `Team[]` | `integrations/<provider>/build-teams.ts` |
| Current NFL week | `lib/nfl/week.ts` |
| Sleeper master player list (cached) | `lib/nfl/sleeper-players.ts` |
| Live game clocks | `lib/nfl/scoreboard.ts` |
| Name → Sleeper id matching | `lib/nfl/player-matching.ts` |
| Stock scoring profile | `lib/nfl/projections.ts` |
| Types, pure logic shared with mobile | `packages/core/src/` |

`lib/nfl/` exists so the four providers can share infrastructure without
importing each other. That rule is real: Yahoo importing from Sleeper
would tangle the fan-out and make it impossible to reason about which
providers a request actually touches.

## Why players get matched by name

Only Sleeper exposes stable player ids. Yahoo, Ottoneu and ESPN give
names, so every non-Sleeper roster is reconciled against the Sleeper
master list before projections or headshots can be attached — that is
what `createSleeperIdResolver` in `lib/nfl/player-matching.ts` does, and
why the Sleeper player list is fetched even for a user with no Sleeper
league.

The same asymmetry explains scoring. Sleeper players are scored against
their own league's real `scoring_settings`. The other three don't expose
their league scoring, so their players are scored with the stock profile
in `lib/nfl/projections.ts`.

## Performance notes

The home page fans out to 1–4 external APIs per render, so:

- Providers run under `Promise.all`, never sequentially.
- The Sleeper player list is fetched once per process (5-minute TTL), not
  once per provider.
- A Yahoo access token is fetched once and reused across that request.
- The ESPN scoreboard is fetched once and shared.
- Every external call is wrapped in `startTimer` / `logDuration` from
  `utils/performance-logger.ts`, so a regression shows up in the logs.

When you add work to this path, batch it and reuse. A sequential await
added here is paid on every single home-page render.
