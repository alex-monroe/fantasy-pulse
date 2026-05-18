import { NextResponse } from 'next/server';
import { getTeams } from '@/app/actions';
import { logDuration, startTimer } from '@/utils/performance-logger';

export const dynamic = 'force-dynamic';

/**
 * Fetches the latest teams and scores from all configured providers.
 */
export async function POST() {
  const overallStart = startTimer();
  console.log('[performance] refresh teams endpoint invoked');

  try {
    const result = await getTeams();

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
