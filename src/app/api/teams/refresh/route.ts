import { NextResponse } from 'next/server';
import { getTeams } from '@/app/actions';

export const dynamic = 'force-dynamic';

/**
 * Fetches the latest teams and scores from all configured providers.
 */
export async function POST() {
  try {
    const result = await getTeams();

    if ('error' in result) {
      const status = result.error === 'You must be logged in.' ? 401 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ teams: result.teams });
  } catch (error) {
    console.error('Failed to refresh teams', error);
    return NextResponse.json(
      { error: 'Failed to refresh scores. Please try again.' },
      { status: 500 }
    );
  }
}
