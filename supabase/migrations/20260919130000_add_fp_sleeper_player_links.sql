-- Crosswalk from a Sleeper player id to the existing public.players row.
--
-- public.players (owned by the sibling Ottoneu repo) is the canonical player
-- table and carries no Sleeper id. This maps Sleeper's id space onto it so
-- Sleeper rosters can be joined to Ottoneu prices, projections and stats in
-- SQL. Only players Ottoneu tracks can be linked; Sleeper's defenses, IDP and
-- retired players have no players row and simply have no link.
--
-- Rebuilt by the daily Sleeper players ingest from unambiguous
-- name + position matches against current rows (ottoneu_id > 0).
--
-- player_id is deliberately NOT a foreign key: an FK would add a constraint to
-- a table this repo does not own, and would break a TRUNCATE or bulk reload of
-- players by the sibling repo's scraper. A dangling link is harmless (it joins
-- to nothing) and is dropped on the next ingest.
CREATE TABLE public.fp_sleeper_player_links (
  sleeper_id TEXT PRIMARY KEY,
  player_id UUID NOT NULL,
  -- How the match was made, for auditing: 'name_position' (the only candidate)
  -- or 'name_position_active' (several, one still active on a team).
  match_method TEXT NOT NULL,
  -- Stamped with the run's start time; rows from an earlier run are pruned.
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX fp_sleeper_player_links_player_id_idx
  ON public.fp_sleeper_player_links (player_id);

-- Public, non-user data: readable by anyone, writable only with the service
-- role key (the ingest endpoint).
ALTER TABLE public.fp_sleeper_player_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_sleeper_player_links_select_all ON public.fp_sleeper_player_links
  FOR SELECT TO anon, authenticated
  USING (true);
