# Database Schema (reference)

> Source of truth is `supabase/migrations/`. This file is a snapshot for
> readers and agents. **Do not execute this SQL** — table order and
> constraints may not be valid for direct execution.

Regenerate after any schema change — see [../COMMANDS.md](../COMMANDS.md)
for the `supabase` CLI invocations, or run the `/db-types` skill.

To explore the schema hands-on, boot a local copy rather than reading:

```bash
npm run db:start        # applies every migration + supabase/seed.sql
npm run db:status       # prints the Studio URL (http://127.0.0.1:54323)
```

## Shared project

Roster Loom shares the **OttoneuDB** Supabase project with an unrelated
repo. Every table this repo owns carries an **`fp_`** prefix (for
fantasy-pulse). Any non-`fp_` table in the `public` schema belongs to the
sibling product: do not drop, alter, rename or "clean up" those, and do
not read their presence as a bug here. New tables added by this repo get
the `fp_` prefix too. If a change here would touch a non-`fp_` table,
stop and ask.

Historical migrations created the app tables under unprefixed names;
`20260518120000_rename_app_tables_with_fp_prefix.sql` renamed them.
Constraint and index names kept their original unprefixed forms
(`leagues_pkey`, `leagues_user_integrations_id_fkey`) — `ALTER TABLE …
RENAME TO` does not rename embedded constraints. Future constraints
should use the `fp_` prefix.

## Tables at a glance

Eight tables, in two groups.

| Table | Group | Purpose | RLS |
| ----- | ----- | ------- | --- |
| `fp_user_integrations` | app | One row per user per connected provider | see below |
| `fp_leagues` | app | Leagues imported from a provider | see below |
| `fp_teams` | app | Teams pulled from a league | see below |
| `fp_notes` | app | Free-form user notes | see below |
| `fp_mcp_tokens` | MCP | Hashed personal access tokens | **enabled** |
| `fp_mcp_oauth_clients` | MCP | Dynamically registered OAuth clients | **enabled** |
| `fp_mcp_oauth_codes` | MCP | Single-use authorization codes | **enabled** |
| `fp_mcp_oauth_tokens` | MCP | Access/refresh token pairs | **enabled** |

```
auth.users
    │
    ├──< fp_user_integrations ──< fp_leagues
    │            │
    │            └──< fp_teams
    ├──< fp_notes
    ├──< fp_mcp_tokens
    ├──< fp_mcp_oauth_codes >── fp_mcp_oauth_clients
    └──< fp_mcp_oauth_tokens >──┘
```

## Row level security

> **Unverified.** No migration in this repo enables RLS on the four app
> tables (`fp_user_integrations`, `fp_leagues`, `fp_teams`, `fp_notes`) —
> they predate any policy and were never retrofitted. Whether the live
> project has policies applied through the Supabase dashboard has not
> been confirmed from this repository.
>
> This matters: `fp_user_integrations` stores Yahoo OAuth access and
> refresh tokens and ESPN `espn_s2` / `swid` session cookies, and the
> anon key ships in the browser bundle. Today those tables are only ever
> read server-side with an explicit `user_id` filter, so the app itself
> is correctly scoped — but that is application discipline, not a
> database guarantee.
>
> **Action:** confirm the live policy list, then either land the missing
> policies as a migration or record here, explicitly, which tables rely
> on server-side scoping instead. Until that happens, treat the anon key
> as more sensitive than "public".

All four MCP tables *do* enable RLS, in migrations, because they hold
credential material. Their unauthenticated paths go through the
`SECURITY DEFINER` functions listed below rather than through policies —
an MCP caller has no Supabase session by definition, so there is no
`auth.uid()` for a policy to match on.

## App tables

```sql
CREATE TABLE public.fp_user_integrations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  provider character varying,
  provider_user_id text,
  -- Yahoo OAuth (20250906220000)
  access_token text,
  refresh_token text,
  token_type text,
  -- ESPN session cookies (20260823130000) — ESPN has no OAuth flow, so
  -- these are copied by hand from a logged-in browser session. See
  -- apps/web/src/app/integrations/espn/README.md.
  espn_s2 text,
  swid text,
  CONSTRAINT user_integrations_pkey PRIMARY KEY (id),
  UNIQUE (user_id, provider)
);

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

CREATE TABLE public.fp_teams (
  id serial PRIMARY KEY,
  team_key text NOT NULL,
  team_id text NOT NULL,
  name text NOT NULL,
  logo_url text,
  user_integration_id integer NOT NULL
    REFERENCES public.fp_user_integrations(id) ON DELETE CASCADE,
  league_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_team_key UNIQUE (team_key)
);

CREATE TABLE public.fp_notes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  text text,
  user_id uuid,
  CONSTRAINT notes_pkey PRIMARY KEY (id)
);
```

## MCP tables

Only used by the hosted MCP server — see [../MCP.md](../MCP.md). Two
authentication paths coexist: personal access tokens (`fp_mcp_tokens`,
for clients that paste a static string) and OAuth 2 with dynamic client
registration (the three `fp_mcp_oauth_*` tables, for connector UIs that
redirect a user through login).

```sql
CREATE TABLE public.fp_mcp_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'MCP token',
  token_prefix text NOT NULL,          -- display only
  token_hash text NOT NULL UNIQUE,     -- SHA-256; plaintext shown once
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT fp_mcp_tokens_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fp_mcp_oauth_clients (
  client_id text PRIMARY KEY,
  client_name text NOT NULL,
  redirect_uris text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS enabled with no policies: reachable only via the SECURITY DEFINER
-- functions below, or a service-role connection.

CREATE TABLE public.fp_mcp_oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL
    REFERENCES public.fp_mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,        -- PKCE, S256 only
  expires_at timestamptz NOT NULL,
  used_at timestamptz,                 -- single use
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fp_mcp_oauth_tokens (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL
    REFERENCES public.fp_mcp_oauth_clients(client_id) ON DELETE CASCADE,
  access_token_hash text NOT NULL UNIQUE,
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
```

## Functions

Eight `SECURITY DEFINER` functions, all in the `public` schema with
`search_path = public, pg_temp`, all `EXECUTE`-granted to `anon` and
`authenticated`. They exist because MCP callers carry no Supabase
session, so there is no `auth.uid()` for an RLS policy to match — the
presented token *is* the credential being checked.

Functions are the part of a Postgres schema you cannot discover by
browsing tables, so keep this list current.

| Function | Returns | Called from |
| -------- | ------- | ----------- |
| `fp_mcp_token_owner(p_token_hash text)` | `uuid` | `lib/mcp/tokens.ts` |
| `fp_mcp_oauth_register_client(p_client_id text, p_client_name text, p_redirect_uris text[])` | `void` | `lib/mcp/oauth.ts` |
| `fp_mcp_oauth_get_client(p_client_id text)` | `table(client_id, client_name, redirect_uris)` | `lib/mcp/oauth.ts` |
| `fp_mcp_oauth_peek_code(p_code_hash text)` | `table(client_id, user_id, redirect_uri, code_challenge, expires_at, used_at)` | `lib/mcp/oauth.ts` |
| `fp_mcp_oauth_consume_code(p_code_hash text)` | `boolean` | `lib/mcp/oauth.ts` |
| `fp_mcp_oauth_issue_tokens(p_user_id uuid, p_client_id text, p_access_hash text, p_refresh_hash text, p_expires_at timestamptz)` | `void` | `lib/mcp/oauth.ts` |
| `fp_mcp_oauth_access_token_owner(p_token_hash text)` | `uuid` | `lib/mcp/oauth.ts` |
| `fp_mcp_oauth_rotate_refresh_token(p_old_refresh_hash text, p_new_access_hash text, p_new_refresh_hash text, p_expires_at timestamptz)` | `table(user_id, client_id)` | `lib/mcp/oauth.ts` |

Behaviour worth knowing:

- `fp_mcp_token_owner` and `fp_mcp_oauth_access_token_owner` both stamp
  `last_used_at` as a side effect of resolving a token. The OAuth one
  also enforces `expires_at`.
- `fp_mcp_oauth_consume_code` is the single-use gate: it returns `false`
  if the code was already consumed or has expired, so a replayed code
  cannot succeed even under a race.
- `fp_mcp_oauth_rotate_refresh_token` overwrites both hashes on the same
  row, so a stolen refresh token stops working as soon as the legitimate
  client refreshes.

## Migration history

| Migration | What it did |
| --------- | ----------- |
| `20250906212948_create_user_integrations_table` | `user_integrations` |
| `20250906214211_create_leagues_table` | `leagues` |
| `20250906220000_add_oauth_tokens_to_user_integrations` | Yahoo token columns |
| `20250907113000_add_teams_table` | `teams` |
| `20250907123500_add_unique_constraint_to_teams_team_key` | `unique_team_key` |
| `20260518120000_rename_app_tables_with_fp_prefix` | `fp_` prefix on all four app tables |
| `20260728120000_add_fp_mcp_tokens` | `fp_mcp_tokens` + `fp_mcp_token_owner` |
| `20260823120000_add_fp_mcp_oauth` | three `fp_mcp_oauth_*` tables + seven functions |
| `20260823130000_add_espn_credentials_to_user_integrations` | `espn_s2`, `swid` |
