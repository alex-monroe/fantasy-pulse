'use server';

import { redirect } from 'next/navigation';

import { createAuthorizationCode, getOAuthClient } from '@/lib/mcp/oauth';
import { createClient } from '@/utils/supabase/server';

/**
 * Handles the user's decision on the /mcp/authorize consent screen:
 * approve issues a single-use authorization code and sends the browser
 * back to the client's redirect_uri; deny sends it back with an
 * `access_denied` error instead. Both are safe redirect targets because
 * the page already validated redirect_uri against the client's
 * registered list before rendering the form this action is bound to.
 */
export async function decideAuthorization(formData: FormData): Promise<void> {
  const decision = formData.get('decision');
  const clientId = String(formData.get('client_id') ?? '');
  const redirectUri = String(formData.get('redirect_uri') ?? '');
  const codeChallenge = String(formData.get('code_challenge') ?? '');
  const state = formData.get('state');

  const client = await getOAuthClient(createClient(), clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) {
    throw new Error('Invalid authorization request.');
  }

  const target = new URL(redirectUri);

  if (decision !== 'approve') {
    target.searchParams.set('error', 'access_denied');
    if (typeof state === 'string' && state) target.searchParams.set('state', state);
    redirect(target.toString());
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('You must be logged in to authorize a client.');
  }

  const code = await createAuthorizationCode(supabase, {
    clientId,
    userId: user.id,
    redirectUri,
    codeChallenge,
  });

  target.searchParams.set('code', code);
  if (typeof state === 'string' && state) target.searchParams.set('state', state);
  redirect(target.toString());
}
