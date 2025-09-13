import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/integrations';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const yahooProvider = getProvider('yahoo');
    const { error } = await yahooProvider.connect(code);

    if (error) {
      return NextResponse.redirect(new URL('/integrations?error=yahoo_connection_failed', request.url));
    }

    return NextResponse.redirect(new URL('/integrations', request.url));
  }

  return NextResponse.redirect(new URL('/integrations?error=yahoo_missing_code', request.url));
}
