import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'You must be logged in to connect your Yahoo account.' }, { status: 401 });
  }

  const client_id = 'dj0yJmk9UVNWVnFlVjhJVEFsJmQ9WVdrOWVtMDRjRkJEYVd3bWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWU0';
  const client_secret = process.env.YAHOO_CLIENT_SECRET;
  if (!client_secret) {
    console.error('YAHOO_CLIENT_SECRET is not set');
    return NextResponse.json({ error: 'Internal Server Error: Missing client secret configuration.' }, { status: 500 });
  }
  const redirect_uri = `${origin}/api/auth/yahoo`;

  const tokenUrl = 'https://api.login.yahoo.com/oauth2/get_token';
  const authHeader = `Basic ${Buffer.from(`${client_id}:${client_secret}`).toString('base64')}`;

  const params = new URLSearchParams();
  params.append('client_id', client_id);
  params.append('client_secret', client_secret);
  params.append('redirect_uri', redirect_uri);
  params.append('code', code);
  params.append('grant_type', 'authorization_code');

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader,
      },
      body: params,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to fetch token:', data);
      return NextResponse.json({ error: 'Failed to fetch token from Yahoo' }, { status: 500 });
    }

    const { access_token, refresh_token, id_token, token_type } = data;

    // Decode id_token to get user info
    const idTokenPayload = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64').toString());
    const provider_user_id = idTokenPayload.sub;

    const { error: insertError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'yahoo',
        provider_user_id: provider_user_id,
        access_token: access_token,
        refresh_token: refresh_token,
        token_type: token_type,
      });

    if (insertError) {
      console.error('Error inserting user integration:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.redirect(`${origin}/integrations/yahoo`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
