import { NextResponse } from 'next/server';

import { authorizeCron } from '@/lib/cron-auth';
import { ingestNews } from '@/lib/news/ingest';
import { logDuration, startTimer } from '@/utils/performance-logger';

export const dynamic = 'force-dynamic';

async function runIngest(request: Request) {
  const overallStart = startTimer();

  // Writes a shared, all-users table, so it is not open: see `authorizeCron`.
  // The `News Ingest` GitHub Actions workflow sends the bearer token.
  const auth = authorizeCron(request, 'News ingest');
  if (!auth.ok) {
    logDuration('news ingest endpoint total', overallStart, {
      status: 'rejected',
      httpStatus: auth.status,
    });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await ingestNews({ force: true });

  if (result.error) {
    logDuration('news ingest endpoint total', overallStart, {
      status: 'error',
      error: result.error,
    });
    return NextResponse.json({ ...result, ok: false }, { status: 502 });
  }

  logDuration('news ingest endpoint total', overallStart, {
    status: 'success',
    itemCount: result.itemCount,
    newItemCount: result.newItemCount,
  });

  return NextResponse.json({ ...result, ok: true });
}

/**
 * Ingests the player-news feed into the shared pool.
 *
 * GET and POST behave identically. The scheduled caller
 * (`.github/workflows/news-ingest.yml`) issues a POST; GET is kept so the
 * endpoint can be poked from a browser or a platform scheduler that only
 * issues GETs.
 */
export async function GET(request: Request) {
  return runIngest(request);
}

/** See {@link GET} — the scheduled workflow uses this one. */
export async function POST(request: Request) {
  return runIngest(request);
}
