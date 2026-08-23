/**
 * OAuth Protected Resource Metadata (RFC 9728) for the MCP endpoint.
 *
 * A 401 from /api/mcp points here (via the `resource_metadata` param on
 * `WWW-Authenticate`) so a client can discover which authorization
 * server to use instead of requiring a hand-pasted token. The catch-all
 * segment accepts both the bare well-known path and the
 * resource-path-appended form (`/.well-known/oauth-protected-resource/api/mcp`)
 * that RFC 9728 and the MCP auth spec both allow.
 */
import { NextResponse } from 'next/server';

import { resolveOrigin } from '@/lib/mcp/server-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const origin = await resolveOrigin();

  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
  });
}
