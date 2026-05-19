import { NextResponse } from 'next/server';
import { getTeams } from '@/app/actions';
import { createApiClient } from '@/utils/supabase/api';
import { logDuration, startTimer } from '@/utils/performance-logger';

export const dynamic = 'force-dynamic';

/**
 * Fetches the latest teams and scores from all configured providers.
 *
 * Auth: cookie-based for browser callers (Next.js RSC / fetch from the
 * web app); `Authorization: Bearer <jwt>` for non-browser callers like
 * the mobile app.
 */
export async function POST(request: Request) {
  const overallStart = startTimer();
  console.log('[performance] refresh teams endpoint invoked');

  const authHeader = request.headers.get('authorization');
  const isBearer = authHeader?.toLowerCase().startsWith('bearer ') ?? false;
  let bearerClient: ReturnType<typeof createApiClient> | undefined;
  let bearerUserId: string | undefined;

  if (isBearer && authHeader) {
    bearerClient = createApiClient(authHeader);
    // supabase.auth.getUser() with no arg reads from an in-memory session
    // (we don't have one server-side); the JWT overload sends the token
    // straight to /auth/v1/user and returns the verified user.
    const token = authHeader.replace(/^bearer\s+/i, '').trim();
    const { data, error: authError } = await bearerClient.auth.getUser(token);
    if (authError || !data.user) {
      return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 401 });
    }
    bearerUserId = data.user.id;
  }

  try {
    const result = await getTeams(bearerClient, bearerUserId);

    if ('error' in result) {
      const status = result.error === 'You must be logged in.' ? 401 : 500;
      logDuration('refresh teams endpoint total', overallStart, {
        status: 'error',
        error: result.error,
        httpStatus: status,
      });
      return NextResponse.json({ error: result.error }, { status });
    }

    logDuration('refresh teams endpoint total', overallStart, {
      status: 'success',
      teamCount: result.teams.length,
    });
    return NextResponse.json({ teams: result.teams });
  } catch (error) {
    console.error('Failed to refresh teams', error);
    logDuration('refresh teams endpoint total', overallStart, {
      status: 'unhandled-error',
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Failed to refresh scores. Please try again.' },
      { status: 500 }
    );
  }
}
