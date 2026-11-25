# Architecture

High-level design of Roster Loom (a.k.a. fantasy-pulse).

## Tech stack

| Layer            | Choice                                                         |
| ---------------- | -------------------------------------------------------------- |
| Framework        | Next.js **15.3.6** (App Router, Turbopack dev)                 |
| Language         | TypeScript 5                                                   |
| Runtime          | Node **24.x** (`engines` + `.nvmrc`)                           |
| UI               | React 18, Tailwind CSS 3, shadcn/Radix UI                      |
| Auth + DB        | Supabase (Postgres + Auth, SSR via `@supabase/ssr`)            |
| Unit tests       | Jest 29 + Testing Library (jsdom env)                          |
| E2E tests        | Playwright 1.55 (CI-only; see [TESTING.md](TESTING.md))        |
| Lint             | ESLint via `next lint` (`next/core-web-vitals`)                |
| Hosting          | Vercel (per-PR previews)                                       |
| Observability    | Vercel Speed Insights, structured `pino` logs, `performance-logger` utility (see [OBSERVABILITY.md](OBSERVABILITY.md)) |

## Top-level layout

```
apps/web/                     # Next.js app (Vercel deploys this)
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (dashboard)/      # Authenticated dashboard route group
│   │   ├── api/              # Route handlers (OAuth callbacks, teams API)
│   │   ├── integrations/     # One folder per provider (sleeper, yahoo, ottoneu)
│   │   ├── login/  register/  forgot-password/  reset-password/
│   │   ├── auth/callback/    # Turns an emailed auth token into a session
│   │   ├── actions.ts        # Cross-provider server actions (team building, scoring)
│   │   ├── layout.tsx  page.tsx  loading.tsx
│   │   └── globals.css
│   ├── components/           # App-specific + shadcn UI primitives (`components/ui`)
│   ├── hooks/                # React hooks (`use-mobile`, `use-toast`)
│   ├── lib/                  # Web-only: env, `cn`, doc-map test, `news/`
│   ├── utils/                # logger, performance-logger, supabase clients
│   ├── ai/                   # Generative AI helpers (currently `dev.ts`)
│   └── middleware.ts         # Supabase session refresh middleware
└── e2e/                      # Playwright specs (do not run locally — see TESTING.md)

packages/core/                # @roster-loom/core — shared with the mobile app
└── src/
    ├── types.ts              # Shared TS types (Team, Player, Sleeper*)
    ├── sleeper.ts            # `mapSleeperPlayer` and related helpers
    ├── fetch-json.ts         # Typed JSON fetch with caching/retry
    ├── news.ts               # Feed parsing + news-to-roster matching
    └── mock-data.ts          # Fixtures for tests and dev

supabase/migrations/          # SQL migrations (source of truth for schema)
```

See [CODE_ORGANIZATION.md](CODE_ORGANIZATION.md) for module boundaries and conventions.

## Data flow: live scoreboard

```
User → / (home)
      → apps/web/src/app/page.tsx (server component)
        → apps/web/src/app/actions.ts:buildAllTeams()
          → for each user_integration:
              → sleeper/actions.ts | yahoo/actions.ts | ottoneu/actions.ts
                → external API (cached/throttled per provider)
              → mapSleeperPlayer / Yahoo parser / Ottoneu scraper (JSDOM)
            → merge into Team[] with cross-team Player share counts
        → render PlayerCard grid with live scores + game progress
```

Every provider follows the same shape: an `actions.ts` (server), a `page.tsx`
(integration management UI), a per-provider `README.md`, and an
`*.example.json` snapshot for the most useful API response.

`getTeams()` is the single seam every consumer sits behind: the web
render, the mobile app (via `/api/teams/refresh`), demo mode, the
[MCP server](MCP.md) (via `/api/mcp`), and the
[news digest](NEWS_DIGEST.md) all read the same `Team[]`.

## Data flow: live play-by-play (shared with ottoneu-db)

During games, scores, game clocks, projections and win probabilities move
play by play, from the same feed ottoneu-db's live score worm runs on —
this repo scrapes nothing new for it.

```
ottoneu-db droplet timer → scripts/live_score_worm.py --loop   (every 60s while games are on)
  → ESPN play-by-play (nflverse once a game is published)
  → nfl_live_games / nfl_live_plays / nfl_live_players          (shared DB, owned by ottoneu-db)
  → live_worm_state.heartbeat_at                                 (is the loop running?)

User → / (home)                    or the open page's 30s poll → /api/teams/refresh?live=1
  → getTeams()  → per-user provider snapshot (15s; a live poll accepts 60s)
  → overlayLiveFeed()               apps/web/src/lib/live-feed/load.ts
      → loadLiveFeed(season, week)  one shared read per instance, cached 15s
      → applyLiveFeed(team)         @roster-loom/core live-feed.ts (pure)
```

- **The feed is league-agnostic.** Each play row holds every player's stat
  line in Sleeper's stat keys, keyed by gsis id; `applyLiveFeed` scores it
  with the league's own settings when we have them (Sleeper always;
  Yahoo/ESPN/Ottoneu once read or confidently inferred, see "League scoring
  settings" below) or a stock half-PPR profile otherwise.
  Players are joined by Sleeper's `gsis_id`/`espn_id` (kept in the stored
  pool), else by name + NFL team + position. Defenses aren't in the feed.
- **Headline score**, as on ottoneu-db's live pages: while the loop's
  heartbeat is under 3 minutes old and the matchup isn't settled, a league
  with exact scoring shows the feed's play-by-play total with the
  provider's official score beneath it ("Off."); the total is the official
  one plus what the feed has seen beyond it, so provider-side bonuses and
  corrections carry through. Otherwise the provider's score is the headline.
- **Projection and win probability** are ottoneu-db's worm model
  (`packages/core/src/worm-model.ts`): a starter's expected final is his
  points plus his projection × the share of his game left (from the feed's
  game clock, which knows overtime); the uncertainty is ottoneu-db's fitted
  `WORM_LINEUP_SD` (20.3 for an 8-starter lineup) shared out per starter and
  scaled by each starter's share of his game still to play.
- **The worm** (`buildMatchupWorm`, drawn by `components/score-worm.tsx` on
  each scoreboard tile) is the win probability after every scoring play.
- **Live pages refresh themselves** every 30s while any team's feed is live,
  pausing while the tab is hidden. A live poll reuses a provider snapshot up
  to 60s old, so open pages don't hit Sleeper/Yahoo/ESPN twice a minute.
- Any feed failure (tables missing, network) reads as "no feed": teams come
  back exactly as the providers built them.

## League scoring settings

Live plays and projections are only exact when we score them with the
league's own rules. Sleeper hands us `scoring_settings` on every league
read. For Yahoo, ESPN and Ottoneu leagues the rules are read once, stored,
and re-checked in the background:

```
getTeams() → buildTeamsForUser()
  → loadLeagueScoring()            one query on fp_league_scoring (lib/league-scoring/store.ts)
  → applyLeagueScoring()           trusted settings → league.scoringSettings; projections re-scored
                                   every league gets league.scoring { source, trusted, stale }

Home page sees league.scoring.stale → POST /api/leagues/scoring/refresh (once per page view)
  → refreshUserLeagueScoring()     lib/league-scoring/refresh-user.ts
     1. read the provider          Yahoo league/{key}/settings · ESPN view=mSettings · Ottoneu /settings page
                                   → translated into Sleeper keys (@roster-loom/core league-scoring.ts)
     2. else infer from past weeks provider points per player-week (Yahoo roster;week=N, ESPN matchup by
                                   scoringPeriodId) vs Sleeper's /v1/stats/nfl/regular/{season}/{week}
                                   → inferScoringSettings() (@roster-loom/core scoring-inference.ts)
     3. else 'unknown'             e.g. a league imported pre-season; retried every 6h and after each week
  → upsert fp_league_scoring, drop the teams snapshot; the page re-fetches if anything changed
```

- **Sources.** `provider` (read), `inferred` (fitted), `unknown`. A failed read
  keeps an earlier successful read rather than discarding it.
- **Inference** searches only the values each platform offers (its
  catalog: e.g. Ottoneu varies nothing but points per reception) from the
  platform default and from a snapped least-squares fit. It uses single and
  paired rule changes and a capped squared error, so stat corrections
  don't bend the fit. Inferred settings are *trusted* (applied to live plays
  and projections) at ≥ 90% exact matches over ≥ 20 player-weeks;
  otherwise they're shown but the stock profile stays.
- **Rules with no Sleeper equivalent** (return TDs, per-slot overrides
  other than reception premiums, yardage buckets) are kept in `unmapped` and
  listed on the league page rather than silently dropped.
- **League pages:** `/leagues` lists every league with its scoring source;
  `/leagues/[provider]/[leagueId]` shows the full table, how it was
  obtained, and a "Check again" button. Scoreboard tiles link there.

## Data flow: news digest

```
cron / stale page render
      → /api/news/ingest → ingestNews()
        → Rotowire RSS → parseNewsFeed → upsert fp_news_items   (shared, user-agnostic)

User → /news-digest
      → getTeams()            (the user's rosters)
      → loadRecentNews()      (a bounded window of the shared pool)
        → buildNewsDigest()   (pure match, in @roster-loom/core)
      → PlayerNewsCard grid
```

The split matters: the feed is the same for everybody, so it is fetched
once for the whole instance rather than per user, and the only per-user
work is an in-memory match. See [NEWS_DIGEST.md](NEWS_DIGEST.md).

## Provider integration pattern

Each integration under `apps/web/src/app/integrations/<provider>/`:

- `actions.ts` — `'use server'` API calls + DB writes; export
  `build<Provider>Teams` consumed by `apps/web/src/app/actions.ts`
- `actions.test.ts` — unit tests colocated next to implementation
- `page.tsx` — UI for connecting and managing the integration
- `README.md` — flow + payload shapes
- `*.example.json` — captured API responses for reference and tests

To add a new provider, follow [adding-integrations.md](adding-integrations.md).

## Database

Supabase Postgres. Schema is owned by SQL migrations in
`supabase/migrations/` and reproduced for reference in
[references/database-schema.md](references/database-schema.md).

Core tables (all prefixed `fp_` to distinguish them from the sibling
repo's tables on the shared OttoneuDB project):

- `fp_user_integrations` — per-user provider connections (Sleeper ID,
  Yahoo OAuth tokens, etc.)
- `fp_leagues` — league rows imported from each provider
- `fp_teams` — teams pulled from each league
- `fp_notes` — free-form user notes
- `fp_mcp_tokens` — hashed personal access tokens for the [MCP
  server](MCP.md)
- `fp_sleeper_players` — single-row shared Sleeper player pool (public read,
  service-role write), refreshed daily
- `fp_sleeper_player_links` — Sleeper id → `players.id` crosswalk (no FK on
  purpose: `players` belongs to the sibling repo)
- `nfl_live_games` / `nfl_live_plays` / `nfl_live_players` and
  `live_worm_state` — **not ours**: ottoneu-db's live NFL feed (its
  migration 066). Read-only here; see "Data flow: live play-by-play".
- `fp_league_scoring` — per-user, per-league-season scoring settings for
  Yahoo/ESPN/Ottoneu leagues, in Sleeper stat keys (see "League scoring
  settings")
- `fp_news_items` / `fp_news_ingests` — the shared player-news pool and
  its ingest bookkeeping (see [NEWS_DIGEST.md](NEWS_DIGEST.md)). Unlike
  every other table here these rows are not per-user: one public feed,
  ingested once, matched to each user's rosters at read time.

RLS is enabled on `fp_mcp_tokens` (credential material — a user may only
see their own rows), on `fp_league_scoring` (own rows only) and on the two `fp_news_` tables (world-readable,
writable only by the service role).

Server-side Supabase access goes through `apps/web/src/utils/supabase/server.ts`;
client-side through `apps/web/src/utils/supabase/client.ts`. `middleware.ts`
keeps sessions fresh on every request.

## Performance discipline

The home page assembles data from 1–3 external fantasy APIs on every
load. Recent commits (see `git log`) have focused on:

- `Promise.all` fan-out in `apps/web/src/app/actions.ts`
- Reusing Yahoo access tokens across a single request
- Caching Sleeper player data (TTL in `actions.ts`)
- A 15s per-user snapshot cache with in-flight coalescing around `getTeams()`
  (`apps/web/src/lib/teams-cache.ts`). The manual refresh passes `fresh: true`
  to skip a settled snapshot; connecting or removing an integration calls
  `invalidateTeamsSnapshots()`. Per server instance, so it bounds duplicate
  work rather than eliminating it.
- The Sleeper player pool (~15MB from Sleeper) is ingested once a day into
  `fp_sleeper_players` (slimmed to the ~1.6MB the app reads) by the `Sleeper
  Players Ingest` workflow → `/api/sleeper-players/ingest`. Instances read that
  row instead of downloading Sleeper's payload, and fall back to Sleeper
  directly if the stored pool is missing or older than 72h. The same run links
  Sleeper ids to the canonical `players` table via `fp_sleeper_player_links`
  (name + position, unambiguous matches only, current rows) so Sleeper rosters
  can be joined to Ottoneu prices/projections in SQL. `players` cannot replace
  the pool itself: it has no Sleeper ids, defenses, IDP or retired players.
- `performance-logger.ts` wrapping every external call so we can spot
  regressions in CI/observability

When adding work to the home-page path, prefer batching and reuse over
sequential awaits, and wrap external calls with `startTimer` / `logDuration`.
