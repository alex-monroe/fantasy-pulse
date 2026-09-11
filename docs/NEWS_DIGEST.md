# News Digest

The `/news-digest` page shows recent NFL news for every player on the
user's rosters, gathered from a syndicated news feed.

## The idea in one line

The news feed is **public and identical for everyone**, so it is ingested
once into a shared pool; everything personal happens at read time, by
matching that pool against the `Team[]` `getTeams()` already builds.

Nothing about a user's rosters is ever written to the news tables.

```
cron (daily) ──┐
               ├─> POST /api/news/ingest ─> ingestNews()
page render ───┘     (when the pool is stale)   │
                                                ├─ fetch Rotowire RSS
                                                ├─ parseNewsFeed + annotateNewsItem
                                                └─ upsert fp_news_items (source, guid)

/news-digest ─> getTeams()  ─────────────┐
             └> loadRecentNews()  ───────┴─> buildNewsDigest() ─> PlayerNewsCard grid
```

## Where the code lives

| Path | Role |
| ---- | ---- |
| `packages/core/src/news.ts` | Pure logic: feed parsing, player extraction, roster matching. Platform-neutral, so the mobile app can reuse it. |
| `apps/web/src/lib/news/source.ts` | Feed URL, freshness TTL, read-window constants. |
| `apps/web/src/lib/news/ingest.ts` | Fetch the feed and upsert it. Service-role Supabase client. |
| `apps/web/src/lib/news/digest.ts` | Read the pool and match it to one user's teams. |
| `apps/web/src/app/api/news/ingest/route.ts` | Cron-triggered ingest endpoint. |
| `apps/web/src/app/(dashboard)/news-digest/` | The page and its components. |
| `supabase/migrations/20260911120000_add_fp_news_items.sql` | `fp_news_items` + `fp_news_ingests`. |

## Matching items to players

An item is tied to a rostered player two ways, strongest first:

1. **`player`** — the headline named them. Rotowire-style headlines lead
   with `Name - POS - TEAM: headline`, which `parseNewsTitle` reads; it
   also handles a bare `Name: headline`, and refuses anything that does
   not look like a person's name so `Week 2 waiver wire: Five adds` is
   not filed under a player called "Week 2 waiver wire".
2. **`mention`** — their name appeared in the item's text. This catches
   the stories that matter without naming the player in the headline (a
   backup's promotion, a target-share note) at the cost of the occasional
   passing reference, which is why the UI labels these differently.

Both sides of the comparison run through `normalizeNewsName`: diacritics
folded, punctuation dropped, lowercased, and generational suffixes
removed, so `Odell Beckham Jr.` and `Odell Beckham` are one player. The
body scan pads the haystack with spaces and tests for `" name "`, which
makes it a word-boundary match — `Josh Allen` does not match a story
about `Josh Allender`.

Matching is indexed by surname so a user with a dozen leagues (a few
hundred rostered players) does not pay a full cross product per render.

## Freshness

Two things keep the pool current:

- **The cron entry in `vercel.json`** hits `/api/news/ingest` once a day
  (12:00 UTC), which is what the Vercel Hobby plan allows.
- **The page itself** ingests on demand when the pool is older than
  `NEWS_FRESHNESS_MS` (15 minutes), so a deployment with no scheduler
  still shows fresh news. That refresh is best-effort — if the feed is
  down the page renders whatever is already stored rather than erroring.

`fp_news_ingests` holds one bookkeeping row per source recording the last
run and its error, if any. A failed run still moves `last_fetched_at`
forward, so a persistently broken feed does not make every page render
retry it and turn one outage into a slow site.

## Auth and access

`fp_news_items` grants `SELECT` to `anon` and `authenticated` and grants
**no write access at all**. The ingest writes with
`SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS — so a leaked anon key
cannot poison the feed. Without that key configured the ingest fails with
a clear error rather than writing nothing silently.

`/api/news/ingest` requires `CRON_SECRET` as a bearer token (Vercel Cron
sends exactly that). When the variable is unset the endpoint returns
**503, disabled** — not open. An unauthenticated write path that appears
whenever an env var is forgotten is the wrong default, and the page's own
stale-refresh covers the gap.

Trigger a run by hand with:

```bash
curl -X POST https://<deployment>/api/news/ingest \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Configuration

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `SUPABASE_SERVICE_ROLE_KEY` | yes, to ingest | Writes to `fp_news_items`. Already used by the MCP server. |
| `CRON_SECRET` | yes, to use the endpoint | Bearer token `/api/news/ingest` checks. Vercel sets this on cron requests when the project defines it. |
| `ROTOWIRE_RSS_URL` | no | Overrides the feed URL. Defaults to Rotowire's public NFL news RSS. |

### A note on `vercel.json`

The cron entry lives in the repo-root `vercel.json`, which is correct
when the Vercel project's **Root Directory** is the repo root (the root
`package.json`'s `build` script delegates into the workspace, which is
what that setup needs). If the project's Root Directory is set to
`apps/web` instead, move the file to `apps/web/vercel.json` — Vercel only
reads the one inside the root directory.

Cron frequency is plan-gated, and this project is on **Hobby**, which
allows one run per day — hence `0 12 * * *`. Hobby also treats the hour
as approximate: the run fires sometime within that hour, not on the
minute. A Pro project can raise this to `0 * * * *` (hourly) or finer.

The daily run is a backstop, not the freshness mechanism. What actually
keeps the digest current is the page's own stale-refresh (see
[Freshness](#freshness) above): the first visit after the pool passes 15
minutes old re-ingests before rendering.
The cron exists so the pool is usually already warm when someone opens
the page, and so it keeps accumulating history on days nobody visits.

## Demo mode

`generateDemoNewsItems` (in `packages/core/src/demo-data.ts`) produces
deterministic fake news about the players on the demo rosters, so
`?demo=1` lights up the digest with no ingest and no database. Like the
rest of [demo mode](DEMO_MODE.md), the same timestamp always yields the
same feed. The page shows a badge saying the news is generated.

## Adding another feed

The schema and the ingest are already keyed by `source`, and items carry
it through to the digest query. To add a second feed: give it a source
name in `source.ts`, call `ingestNews({ source, url })` for it, and widen
`loadRecentNews`'s `source` filter. The parser handles RSS 2.0 and Atom,
so most feeds need no new parsing code.

## Known limits

- Player identity is name-based. Two active players with the same
  normalized name would collide; the feed carries no player id we can
  join on.
- The digest reads a seven-day window capped at 500 rows
  (`NEWS_WINDOW_DAYS`, `NEWS_ITEM_LIMIT`). Older items stay in the table
  but are not shown — there is no pruning job yet.
- `parseNewsTitle` was written against the documented shape of the
  Rotowire feed but could not be verified against a live response from
  the sandbox this was built in (outbound access to `rotowire.com` was
  blocked). It degrades safely: a headline it cannot parse still reaches
  the digest through the body-text scan. Worth eyeballing the first real
  ingest to confirm the `player` match rate looks right.
