/**
 * OAuth Dynamic Client Registration (RFC 7591).
 *
 * Open registration, no admin approval: a connector UI calls this the
 * first time a user adds the server, before any human is in the loop.
 * Every registered client is public (no client_secret) — PKCE is
 * mandatory on /mcp/authorize instead. See docs/MCP.md.
 */
import { NextResponse } from 'next/server';

import { registerOAuthClient } from '@/lib/mcp/oauth';
import { createMcpSupabaseClient } from '@/lib/mcp/supabase';

export const dynamic = 'force-dynamic';

function errorResponse(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_client_metadata', 'Request body is not valid JSON.');
  }

  if (typeof body !== 'object' || body === null) {
    return errorResponse('invalid_client_metadata', 'Request body must be a JSON object.');
  }

  const metadata = body as Record<string, unknown>;
  const redirectUris = metadata.redirect_uris;

  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((uri) => typeof uri === 'string' && uri.length > 0)
  ) {
    return errorResponse('invalid_client_metadata', 'redirect_uris must be a non-empty array of strings.');
  }

  for (const uri of redirectUris) {
    try {
      new URL(uri as string);
    } catch {
      return errorResponse('invalid_redirect_uri', `Not a valid absolute URL: ${uri}`);
    }
  }

  const clientName =
    typeof metadata.client_name === 'string' && metadata.client_name.trim()
      ? metadata.client_name.trim().slice(0, 200)
      : 'Unnamed MCP client';

  const supabase = createMcpSupabaseClient();
  const client = await registerOAuthClient(supabase, clientName, redirectUris as string[]);

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201 },
  );
}
