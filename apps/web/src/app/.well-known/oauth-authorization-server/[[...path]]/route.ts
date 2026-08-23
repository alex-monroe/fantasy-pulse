/**
 * OAuth Authorization Server Metadata (RFC 8414), so a Dynamic Client
 * Registration-capable MCP client can discover the authorize, token and
 * registration endpoints without hardcoding them. The catch-all segment
 * accepts both the bare well-known path and any resource-path-appended
 * form a client may probe.
 */
import { NextResponse } from 'next/server';

import { resolveOrigin } from '@/lib/mcp/server-url';

export const dynamic = 'force-dynamic';

export async function GET() {
  const origin = await resolveOrigin();

  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/mcp/authorize`,
    token_endpoint: `${origin}/api/mcp/token`,
    registration_endpoint: `${origin}/api/mcp/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
}
