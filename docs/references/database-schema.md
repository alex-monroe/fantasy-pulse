# Database Schema (reference)

> Source of truth is `supabase/migrations/`. This file is a snapshot for
> agent context. **Do not execute this SQL** — table order and constraints
> may not be valid for direct execution.

Regenerate after schema changes (see [../COMMANDS.md](../COMMANDS.md) for
the `supabase` CLI invocations).

All Roster Loom tables carry an `fp_` prefix to distinguish them from
the sibling repo's tables on the shared OttoneuDB Supabase project.
Historical migrations created the tables under their unprefixed names;
`20260518120000_rename_app_tables_with_fp_prefix.sql` renamed them.

```sql
CREATE TABLE public.fp_leagues (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  league_id text,
  name character varying,
  user_integration_id bigint,
  season text,
  total_rosters bigint,
  status text,
  user_id uuid DEFAULT auth.uid(),
  CONSTRAINT leagues_pkey PRIMARY KEY (id),
  CONSTRAINT leagues_user_integrations_id_fkey
    FOREIGN KEY (user_integration_id)
    REFERENCES public.fp_user_integrations(id)
);

CREATE TABLE public.fp_notes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  text text,
  user_id uuid,
  CONSTRAINT notes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fp_user_integrations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  provider character varying,
  provider_user_id text,
  access_token text,
  refresh_token text,
  token_type text,
  espn_s2 text,
  swid text,
  CONSTRAINT user_integrations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fp_news_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  source text NOT NULL DEFAULT 'rotowire',
  guid text NOT NULL,
  title text NOT NULL,
  headline text,
  link text,
  summary text,
  author text,
  published_at timestamp with time zone,
  player_name text,
  player_key text,
  position text,
  nfl_team text,
  search_text text NOT NULL DEFAULT '',
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT fp_news_items_pkey PRIMARY KEY (id),
  CONSTRAINT fp_news_items_source_guid_key UNIQUE (source, guid)
);

CREATE TABLE public.fp_news_ingests (
  source text NOT NULL,
  last_fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  item_count integer NOT NULL DEFAULT 0,
  new_item_count integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT fp_news_ingests_pkey PRIMARY KEY (source)
);

CREATE TABLE public.fp_mcp_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'MCP token',
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone,
  CONSTRAINT fp_mcp_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT fp_mcp_tokens_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE
);
```

`fp_mcp_tokens` has **row level security enabled** — it stores credential
material for the [MCP server](../MCP.md), so a user may only read and
manage their own rows. Token verification does not read the table
directly; it goes through the `fp_mcp_token_owner(text)` SECURITY DEFINER
function, which resolves a SHA-256 hash to a user id and stamps
`last_used_at`.

`fp_news_items` and `fp_news_ingests` also have RLS enabled, but the
other way around: `SELECT` is granted to `anon` and `authenticated`
(the news pool is public, user-agnostic data) and **no write policy
exists at all** — the ingest writes with the service role key. These are
the only tables in this repo with no `user_id` column, by design; see
[../NEWS_DIGEST.md](../NEWS_DIGEST.md).

A `fp_teams` table also exists (originally created as `teams` by
`supabase/migrations/20250907113000_add_teams_table.sql` and constrained
by `20250907123500_add_unique_constraint_to_teams_team_key.sql`); refer
to those migrations for the authoritative definition.

OAuth token columns were added to `fp_user_integrations` (then named
`user_integrations`) by
`20250906220000_add_oauth_tokens_to_user_integrations.sql`.

`espn_s2` and `swid` were added to `fp_user_integrations` by
`20260823130000_add_espn_credentials_to_user_integrations.sql` — ESPN has
no OAuth flow, so these store the two cookies copied from a logged-in
ESPN browser session (see
[../../apps/web/src/app/integrations/espn/README.md](../../apps/web/src/app/integrations/espn/README.md)).

Note: constraint and index names (e.g. `leagues_pkey`,
`leagues_user_integrations_id_fkey`) kept their original unprefixed
names — `ALTER TABLE ... RENAME TO` does not rename embedded
constraints, and the names are stable identifiers Postgres uses
internally. Future constraints should use the `fp_` prefix.

## fp_sleeper_players

Shared (not per-user) Sleeper player pool. One row, `id = 'nfl'`; refreshed
daily by `/api/sleeper-players/ingest`. RLS: public `SELECT`, writes only via
the service role.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `text` PK | Pool id, `'nfl'` |
| `players` | `jsonb` | `{ [sleeperPlayerId]: { full_name, first_name, last_name, position, team, active, search_rank } }` |
| `player_count` | `integer` | Number of players in `players` |
| `fetched_at` | `timestamptz` | When the pool was last ingested |
