-- Ingested player news (the "News Digest" page).
--
-- Unlike every other fp_ table, these rows are NOT per-user: the source
-- is one public NFL news feed (Rotowire's RSS), identical for everybody,
-- so it is ingested once on a schedule and every user's digest is built
-- by matching this shared pool against their own rosters at read time.
-- There is therefore no user_id column and nothing user-identifying here.
CREATE TABLE public.fp_news_items (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- Where the item came from. One column now ('rotowire'), but the
  -- ingest is shaped to take more feeds without a schema change.
  source TEXT NOT NULL DEFAULT 'rotowire',
  -- The feed's own <guid> (or its link). Unique per source so a re-ingest
  -- of an unchanged feed updates rows instead of duplicating them.
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  -- The headline with the "Name - POS - TEAM:" prefix stripped off.
  headline TEXT,
  link TEXT,
  summary TEXT,
  author TEXT,
  -- The feed's <pubDate>. Nullable: an item with an unparseable date is
  -- still worth showing, just sorted last.
  published_at TIMESTAMPTZ,
  -- Player identity parsed out of the headline, best-effort.
  -- player_key is the normalized name (see normalizeNewsName in
  -- @roster-loom/core) that roster players are matched against.
  player_name TEXT,
  player_key TEXT,
  position TEXT,
  nfl_team TEXT,
  -- Normalized title + body, space-padded, so items whose headline names
  -- nobody can still be matched by a name appearing in the text.
  search_text TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fp_news_items_source_guid_key UNIQUE (source, guid)
);

-- The digest reads one bounded window: "the newest N items since T".
CREATE INDEX fp_news_items_published_at_idx
  ON public.fp_news_items (published_at DESC NULLS LAST);

-- Lets a targeted lookup for a single player skip the window scan.
CREATE INDEX fp_news_items_player_key_idx
  ON public.fp_news_items (player_key)
  WHERE player_key IS NOT NULL;

-- Public, non-user data: anyone signed in (or not) may read it, nobody
-- may write it through PostgREST. The ingest endpoint writes with the
-- service role key, which bypasses RLS, so no INSERT/UPDATE policy is
-- granted here on purpose — a leaked anon key cannot poison the feed.
ALTER TABLE public.fp_news_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_news_items_select_all ON public.fp_news_items
  FOR SELECT TO anon, authenticated
  USING (true);

-- Bookkeeping for the ingest itself: one row per source recording the
-- last successful run, so a page render can decide whether the pool is
-- stale enough to refresh on demand rather than always hitting the feed.
CREATE TABLE public.fp_news_ingests (
  source TEXT PRIMARY KEY,
  last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Items seen in the last run, and of those, how many were new.
  item_count INTEGER NOT NULL DEFAULT 0,
  new_item_count INTEGER NOT NULL DEFAULT 0,
  -- Populated when the last run failed; cleared on success.
  last_error TEXT
);

ALTER TABLE public.fp_news_ingests ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_news_ingests_select_all ON public.fp_news_ingests
  FOR SELECT TO anon, authenticated
  USING (true);
