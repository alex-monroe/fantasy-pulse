/**
 * The hosted MCP server endpoint.
 *
 * Speaks MCP's Streamable HTTP transport statelessly: one POST carries a
 * JSON-RPC message, one response carries the answer. There is no SSE
 * stream and no session id, because the server never initiates messages
 * and holds nothing between requests — which is what lets it run on
 * serverless hosting alongside the rest of the app.
 *
 * Auth is a personal access token minted at /mcp and presented as
 * `Authorization: Bearer rl_mcp_...`; see docs/MCP.md.
 */
import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { getCurrentNflWeek, getTeams } from '@/app/actions';
import { DEMO_HEADER, resolveDemoMode } from '@/lib/demo-mode';
import { dispatchMcpPayload, SUPPORTED_PROTOCOL_VERSIONS } from '@/lib/mcp/protocol';
import type { McpToolContext } from '@/lib/mcp/tools';
import { parseBearerToken, resolveMcpTokenUser } from '@/lib/mcp/tokens';
import { logDuration, startTimer } from '@/utils/performance-logger';

export const dynamic = 'force-dynamic';

/** Advertised so clients know which auth scheme to use on a 401. */
const AUTH_CHALLENGE = 'Bearer realm="Roster Loom MCP", error="invalid_token"';

/**
 * Supabase client for MCP requests.
 *
 * Prefers the service role key when configured, since MCP callers
 * authenticate with their own token rather than a Supabase session and
 * so carry no `auth.uid()`. Falls back to the anon key, which matches
 * how the existing bearer-authenticated `/api/teams/refresh` path
 * queries. Either way every query is explicitly scoped by user id.
 */
function createMcpSupabaseClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

function jsonResponse(body: unknown, status: number, protocolVersion: string) {
  return NextResponse.json(body, {
    status,
    headers: { 'MCP-Protocol-Version': protocolVersion },
  });
}

/**
 * Handles an MCP JSON-RPC message.
 *
 * @param request - The incoming POST.
 * @returns The JSON-RPC response.
 */
export async function POST(request: Request) {
  const overallStart = startTimer();

  const requestedVersion = request.headers.get('mcp-protocol-version');
  const protocolVersion =
    requestedVersion && SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
      ? requestedVersion
      : SUPPORTED_PROTOCOL_VERSIONS[0];

  const token = parseBearerToken(request.headers.get('authorization'));
  if (!token) {
    return NextResponse.json(
      { error: 'Missing bearer token. Create one at /mcp.' },
      { status: 401, headers: { 'WWW-Authenticate': AUTH_CHALLENGE } },
    );
  }

  const supabase = createMcpSupabaseClient();

  const authStart = startTimer();
  const userId = await resolveMcpTokenUser(supabase, token);
  logDuration('mcp: authenticate token', authStart, { authenticated: Boolean(userId) });

  if (!userId) {
    return NextResponse.json(
      { error: 'Invalid or revoked token.' },
      { status: 401, headers: { 'WWW-Authenticate': AUTH_CHALLENGE } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Request body is not valid JSON.' },
      },
      400,
      protocolVersion,
    );
  }

  const demo = resolveDemoMode({ headerValue: request.headers.get(DEMO_HEADER) });

  // Invoked only when a tool actually needs data — the
  // initialize/tools/list handshake must not fan out to the fantasy
  // providers. `dispatchMcpPayload` guarantees at most one call.
  const loadContext = async (): Promise<McpToolContext> => {
    const dataStart = startTimer();

    const [teamsResult, week] = await Promise.all([
      getTeams(supabase, userId, { demo }),
      getCurrentNflWeek().catch(() => null),
    ]);

    if ('error' in teamsResult) {
      logDuration('mcp: load teams', dataStart, { success: false });
      throw new Error(teamsResult.error);
    }

    logDuration('mcp: load teams', dataStart, {
      success: true,
      teamCount: teamsResult.teams.length,
    });

    return {
      teams: teamsResult.teams,
      week: typeof week === 'number' ? week : null,
      demo,
    };
  };

  const { status, body } = await dispatchMcpPayload(payload, loadContext);

  logDuration('mcp request total', overallStart, { status });

  if (body === null) {
    return new NextResponse(null, {
      status,
      headers: { 'MCP-Protocol-Version': protocolVersion },
    });
  }

  return jsonResponse(body, status, protocolVersion);
}

/**
 * Streamable HTTP allows clients to open a GET stream for
 * server-initiated messages. This server never sends any, so the stream
 * is declined per spec.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'This MCP server does not offer a server-initiated event stream.' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}

/**
 * Session termination is a no-op: the server is stateless, so there is
 * never a session to delete.
 */
export async function DELETE() {
  return new NextResponse(null, { status: 204 });
}
