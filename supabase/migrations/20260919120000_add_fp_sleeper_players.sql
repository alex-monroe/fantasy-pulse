-- Shared Sleeper player pool.
--
-- Sleeper's /v1/players/nfl is ~15MB and changes slowly (Sleeper asks that it
-- be fetched at most once a day). Every server instance used to download and
-- parse it on cold start and again every 5 minutes. It is the same for every
-- user, so it is ingested once on a schedule into this single-row table, slimmed
-- to the handful of fields the app reads (~1.6MB), and instances read that row
-- instead. Like fp_news_items, nothing here is per-user.
CREATE TABLE public.fp_sleeper_players (
  -- One row per sport/pool. Only 'nfl' today.
  id TEXT PRIMARY KEY,
  -- { "<sleeper_player_id>": { full_name, first_name, last_name, position,
  --   team, active, search_rank } }
  players JSONB NOT NULL,
  player_count INTEGER NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public, non-user data: readable by anyone, writable only with the service
-- role key (the ingest endpoint), so no INSERT/UPDATE policy on purpose.
ALTER TABLE public.fp_sleeper_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_sleeper_players_select_all ON public.fp_sleeper_players
  FOR SELECT TO anon, authenticated
  USING (true);
