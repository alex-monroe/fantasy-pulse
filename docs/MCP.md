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

The server needs the `fp_mcp_tokens` table and its lookup function, so
apply the migrations to the linked project once before first use:

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

1. Sign in and open **/mcp**.
2. Create an access token and copy it — it is shown once.
3. Point your client at the endpoint with the token as a bearer header.

Claude Code:

```bash
claude mcp add --transport http roster-loom https://<your-deployment>/api/mcp \
  --header "Authorization: Bearer rl_mcp_..."
```

`claude_desktop_config.json`:

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

Locally, the dev server on port 9002 serves the same endpoint at
`http://localhost:9002/api/mcp`.

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

MCP clients store a static string in their config, so Supabase's
hour-long access tokens are unusable here. Instead `/mcp` mints
long-lived personal access tokens:

- The token is `rl_mcp_` + 32 random bytes.
- Only its SHA-256 is stored, in `fp_mcp_tokens`. The plaintext is shown
  once and is unrecoverable.
- Requests present it as `Authorization: Bearer <token>`.
- Verification goes through the `fp_mcp_token_owner` SECURITY DEFINER
  function, which resolves the hash to a user id and stamps
  `last_used_at`.
- Revoking sets `revoked_at`, which takes effect on the next request.

`fp_mcp_tokens` is the one table in this schema with RLS enabled — a user
can only ever see and manage their own tokens. Unlike the other `fp_`
tables it holds credential material, so it does not inherit their
open-by-default posture.

A token grants read access to everything the owning account can see.
Treat it like a password, and revoke it at `/mcp` if it leaks.

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
└── tokens.ts       # Token minting, hashing, verification

apps/web/src/app/api/mcp/route.ts        # HTTP layer: auth, data loading
apps/web/src/app/(dashboard)/mcp/        # Token management UI
supabase/migrations/*_add_fp_mcp_tokens.sql
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
