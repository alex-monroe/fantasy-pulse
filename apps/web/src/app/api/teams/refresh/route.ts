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
  const bearerClient = authHeader?.toLowerCase().startsWith('bearer ')
    ? createApiClient(authHeader)
    : undefined;

  try {
    const result = await getTeams(bearerClient);

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
