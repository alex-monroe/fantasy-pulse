# MCP Server

Roster Loom hosts a [Model Context Protocol](https://modelcontextprotocol.io)
server so an AI assistant can read your leagues, rosters and live
matchups across every connected provider.

It runs inside the Next.js app — there is no separate service to deploy.
The endpoint ships with the Vercel deployment at:

```
POST https://<your-deployment>/api/mcp
```

## Setup

The server needs the `fp_mcp_tokens` and `fp_mcp_oauth_*` tables and
their lookup functions, so apply the migrations to the linked project
once before first use:

```bash
npx supabase db push
```

Until that runs, `/mcp` cannot mint tokens and every request to
`/api/mcp` answers `401`.

No new environment variables are required. `SUPABASE_SERVICE_ROLE_KEY`
is used when present — MCP callers authenticate with their own token and
so carry no Supabase session — and the endpoint falls back to the anon
key, matching how the existing bearer-authenticated
`/api/teams/refresh` path queries. Either way every query is explicitly
scoped by user id.

## Connecting a client

Two ways to authenticate, depending on what the client supports:

### Personal access token

For clients that let you paste a static bearer token into their config
(Claude Code, `claude_desktop_config.json`):

1. Sign in and open **/mcp**.
2. Create an access token and copy it — it is shown once.
3. Point your client at the endpoint with the token as a bearer header.

```bash
claude mcp add --transport http roster-loom https://<your-deployment>/api/mcp \
  --header "Authorization: Bearer rl_mcp_..."
```

```json
{
  "mcpServers": {
    "roster-loom": {
      "type": "http",
      "url": "https://<your-deployment>/api/mcp",
      "headers": { "Authorization": "Bearer rl_mcp_..." }
    }
  }
}
```

### OAuth (Dynamic Client Registration)

For connector UIs that only take a server URL and don't offer a place
to paste a token (e.g. Claude.ai's remote MCP connector), point the
client at `https://<your-deployment>/api/mcp` with no header. It
discovers everything else itself:

1. `GET /.well-known/oauth-protected-resource/api/mcp` — resolved from
   the `resource_metadata` param on the endpoint's `401`.
2. `GET /.well-known/oauth-authorization-server` — the authorization,
   token and registration endpoints.
3. `POST /api/mcp/register` — self-registers as a client (RFC 7591).
4. Redirects the user's browser to `/mcp/authorize` (PKCE, `S256`
   required); the user signs in if needed and approves the client.
5. `POST /api/mcp/token` — exchanges the resulting code for an access
   token, and later refreshes it.

Locally, the dev server on port 9002 serves the same endpoints at
`http://localhost:9002`.

## Tools

| Tool | Arguments | Returns |
| ---- | --------- | ------- |
| `list_leagues` | — | Every league, with your score, the opponent's, the margin, and starters yet to play. Returns the `leagueKey` other tools take. |
| `get_league_matchup` | `leagueKey` | One league's full matchup: both starting lineups and benches, per-player points, live game state. |
| `list_rostered_players` | `position?`, `onlyStarters?`, `onlyMultiLeague?` | Every player across all leagues, deduplicated, with the leagues they're rostered and opposed in. |
| `find_player` | `query` | Where a player appears across every roster, yours and your opponents'. |
| `get_rooting_guide` | — | Players to root for, root against, and be conflicted about. |

All tools are read-only. Nothing writes back to a fantasy provider.

`leagueKey` is `<provider>:<providerLeagueId>` (e.g. `sleeper:123456789`).
Tools also accept a league or team name, since a model relaying a name
from an earlier answer is a likely mistake.

## Authentication

Two token flows feed the same `Authorization: Bearer <token>` check in
`/api/mcp`.

**Personal access tokens** — for clients that store a static string in
their config, where Supabase's hour-long access tokens are unusable:

- The token is `rl_mcp_` + 32 random bytes.
- Only its SHA-256 is stored, in `fp_mcp_tokens`. The plaintext is shown
  once and is unrecoverable.
- Verification goes through the `fp_mcp_token_owner` SECURITY DEFINER
  function, which resolves the hash to a user id and stamps
  `last_used_at`.
- Revoking sets `revoked_at`, which takes effect on the next request.
- Non-expiring until revoked.

**OAuth (DCR)** — for connector UIs that run an authorization-code +
PKCE flow instead (see [Connecting a client](#connecting-a-client)):

- `fp_mcp_oauth_clients` holds dynamically registered clients
  (`rl_mcp_client_...`), all public — no client secret, since PKCE
  (`S256`) is mandatory instead.
- `fp_mcp_oauth_codes` holds single-use authorization codes
  (`rl_mcp_code_...`), 5-minute lifetime, bound to the approving user,
  the client, the redirect URI and the PKCE challenge.
- `fp_mcp_oauth_tokens` holds access (`rl_mcp_at_...`) and refresh
  (`rl_mcp_rt_...`) token pairs. Access tokens expire after 1 hour;
  refreshing rotates both hashes on the same row in place, so a stale
  refresh token — rotated-away or replayed — stops working immediately.
- Implementation: `apps/web/src/lib/mcp/oauth.ts`.

`fp_mcp_tokens` and the `fp_mcp_oauth_*` tables are the only tables in
this schema with RLS enabled — unlike the other `fp_` tables, they hold
credential material, so they don't inherit the open-by-default posture.
Everything reachable by an unauthenticated caller (token/code
verification, client registration) goes through a SECURITY DEFINER
function rather than a table policy.

Any of these tokens grants read access to everything the owning account
can see. Treat them like a password, and revoke a leaked one at `/mcp`
(personal access tokens) — an OAuth-issued token expires within the
hour on its own if not refreshed.

## Transport

The server speaks MCP's Streamable HTTP transport statelessly: one POST
carries a JSON-RPC message, one response carries the answer. There is no
SSE stream and no session id, because the server never initiates
messages and retains nothing between requests — which is what lets it
run on serverless hosting.

- `POST` — JSON-RPC. Supports `initialize`, `ping`, `tools/list`,
  `tools/call`, notifications, and pre-2025-06-18 batch arrays.
- `GET` — `405`. No server-initiated event stream is offered.
- `DELETE` — `204`. There is no session to terminate.

Protocol revisions `2025-06-18`, `2025-03-26` and `2024-11-05` are
accepted; the client's choice is echoed when supported.

The implementation is hand-rolled in `apps/web/src/lib/mcp/` rather than
delegated to an adapter. The tools-only, stateless surface is small, and
the available Next.js adapter pins an exact `@modelcontextprotocol/sdk`
version and hard-depends on `redis`, neither of which this app needs.

## Layout

```
apps/web/src/lib/mcp/
├── protocol.ts     # JSON-RPC dispatch + Streamable HTTP semantics
├── tools.ts        # Tool definitions and handlers
├── views.ts        # Pure Team[] -> tool payload transforms
├── tokens.ts       # Personal access token minting, hashing, verification
├── oauth.ts         # DCR client registration + auth code/PKCE + token issuance
├── server-url.ts     # Origin resolution for metadata + redirect URLs
└── supabase.ts       # Service-role client shared by the unauthenticated endpoints

apps/web/src/app/api/mcp/route.ts          # HTTP layer: auth, data loading
apps/web/src/app/api/mcp/register/route.ts # DCR client registration
apps/web/src/app/api/mcp/token/route.ts    # OAuth token exchange + refresh
apps/web/src/app/mcp/authorize/            # OAuth consent screen
apps/web/src/app/.well-known/              # OAuth AS + protected-resource metadata
apps/web/src/app/(dashboard)/mcp/          # Token management UI
supabase/migrations/*_add_fp_mcp_tokens.sql
supabase/migrations/*_add_fp_mcp_oauth.sql
```

Tools are pure functions of the `Team[]` that `getTeams()` already
builds, so the MCP server inherits every provider, live scoring, and
[demo mode](DEMO_MODE.md) for free — send `x-demo-mode: 1` to exercise
the tools with fake data out of season.

## Performance

The provider fan-out is expensive (1–3 external APIs), so it is loaded
lazily and at most once per request: `initialize` and `tools/list` never
touch a provider, and a batch containing several `tools/call` messages
still fans out only once. `dispatchMcpPayload` owns that guarantee, so
it holds regardless of how the route's loader is written.
