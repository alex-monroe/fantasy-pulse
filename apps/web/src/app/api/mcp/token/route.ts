/**
 * OAuth token endpoint: exchanges an authorization code (with its PKCE
 * verifier) for an access/refresh token pair, or rotates a refresh
 * token for a fresh pair. See docs/MCP.md.
 */
import { NextResponse } from 'next/server';

import { exchangeAuthorizationCode, getOAuthClient, issueOAuthTokens, rotateOAuthTokens } from '@/lib/mcp/oauth';
import { createMcpSupabaseClient } from '@/lib/mcp/supabase';

export const dynamic = 'force-dynamic';

function errorResponse(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

/** Reads token endpoint params from either form-urlencoded or JSON bodies. */
async function readParams(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return typeof body === 'object' && body !== null ? (body as Record<string, string>) : {};
  }

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      params[key] = value;
    }
  }
  return params;
}

export async function POST(request: Request) {
  const params = await readParams(request);
  const supabase = createMcpSupabaseClient();

  if (params.grant_type === 'authorization_code') {
    const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = params;

    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return errorResponse(
        'invalid_request',
        'code, redirect_uri, client_id and code_verifier are all required.',
      );
    }

    const result = await exchangeAuthorizationCode(supabase, {
      code,
      redirectUri,
      clientId,
      codeVerifier,
    });

    if (!result.ok) {
      return errorResponse(result.error, 'The authorization code is invalid, expired, or already used.');
    }

    const tokens = await issueOAuthTokens(supabase, { userId: result.userId, clientId });

    return NextResponse.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
    });
  }

  if (params.grant_type === 'refresh_token') {
    const { refresh_token: refreshToken, client_id: clientId } = params;

    if (!refreshToken || !clientId) {
      return errorResponse('invalid_request', 'refresh_token and client_id are both required.');
    }

    const client = await getOAuthClient(supabase, clientId);
    if (!client) {
      return errorResponse('invalid_client', 'Unknown client_id.');
    }

    const tokens = await rotateOAuthTokens(supabase, refreshToken, clientId);
    if (!tokens) {
      return errorResponse('invalid_grant', 'The refresh token is invalid, revoked, or belongs to a different client.');
    }

    return NextResponse.json({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: 'Bearer',
      expires_in: tokens.expiresIn,
    });
  }

  return errorResponse('unsupported_grant_type', 'Only authorization_code and refresh_token grants are supported.');
}
