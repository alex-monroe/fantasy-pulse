-- Scoring settings for leagues on providers that don't hand them to us with
-- every request (Yahoo, ESPN, Ottoneu). Sleeper leagues read
-- `scoring_settings` live and never land here.
--
-- Settings are stored in Sleeper's stat keys (see
-- packages/core/src/league-scoring.ts), so the same scorers serve every
-- provider. A row's `source` says where they came from:
--
--   unknown  - nothing yet: the provider read failed and there are no
--              completed weeks to infer from (a league imported pre-season)
--   provider - read from the provider's own settings
--   inferred - fitted from past weeks' official points against Sleeper's
--              weekly stat lines (packages/core/src/scoring-inference.ts);
--              `inference` holds the sample size and match rate
--
-- One row per user per league-season. Reading a league's settings needs the
-- user's own provider credentials (Yahoo token, ESPN cookies), so rows are
-- per user and RLS-scoped like fp_mcp_tokens rather than shared.
CREATE TABLE public.fp_league_scoring (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('yahoo', 'espn', 'ottoneu')),
  provider_league_id TEXT NOT NULL,
  season TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'unknown' CHECK (source IN ('unknown', 'provider', 'inferred')),
  -- Sleeper stat key -> points.
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Provider rules with no Sleeper equivalent: [{ "label", "value" }].
  unmapped JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { sampleSize, matchRate, throughWeek, assumed[] } for inferred rows.
  inference JSONB,
  -- Why the most recent provider read failed, if it did.
  read_error TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, provider_league_id, season)
);

ALTER TABLE public.fp_league_scoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY fp_league_scoring_select_own ON public.fp_league_scoring
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY fp_league_scoring_insert_own ON public.fp_league_scoring
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY fp_league_scoring_update_own ON public.fp_league_scoring
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY fp_league_scoring_delete_own ON public.fp_league_scoring
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
