import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { connectYahoo } from '@/app/integrations/yahoo/actions';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${url.origin}/integrations/yahoo?error=missing_code`);
  }

  const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/api/auth/yahoo`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok) {
    const description = tokenData.error_description || 'Failed to obtain access token';
    return NextResponse.redirect(`${url.origin}/integrations/yahoo?error=${encodeURIComponent(description)}`);
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${url.origin}/login`);
  }

  let providerUserId = tokenData.xoauth_yahoo_guid;
  const { user: yahooUser } = await connectYahoo(tokenData.access_token);
  if (yahooUser && yahooUser.sub) {
    providerUserId = yahooUser.sub;
  }

  const { error } = await supabase.from('user_integrations').upsert({
    user_id: user.id,
    provider: 'yahoo',
    provider_user_id: providerUserId,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type,
  }, { onConflict: 'user_id,provider' });

  if (error) {
    return NextResponse.redirect(`${url.origin}/integrations/yahoo?error=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${url.origin}/integrations/yahoo`);
}
