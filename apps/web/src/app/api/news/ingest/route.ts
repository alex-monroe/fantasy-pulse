import { NextResponse } from 'next/server';

import { ingestNews } from '@/lib/news/ingest';
import { logDuration, startTimer } from '@/utils/performance-logger';

export const dynamic = 'force-dynamic';

/**
 * Whether a request is allowed to trigger an ingest.
 *
 * The endpoint writes to a shared, all-users table, so it is not open:
 * the caller must present `CRON_SECRET` as a bearer token. The `News
 * Ingest` GitHub Actions workflow sends exactly that header.
 *
 * When `CRON_SECRET` is unset the endpoint is disabled rather than open —
 * an unauthenticated write path that appears whenever an env var is
 * forgotten is the wrong default. The digest page refreshes the pool on
 * its own when it goes stale, so a deployment without the secret still
 * gets fresh news.
 *
 * @param request - The incoming request.
 * @returns Whether the caller is authorized, and why not when it isn't.
 */
function authorize(request: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'News ingest is disabled: CRON_SECRET is not configured.',
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.replace(/^bearer\s+/i, '').trim();

  if (!presented || presented !== secret) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  return { ok: true };
}

async function runIngest(request: Request) {
  const overallStart = startTimer();

  const auth = authorize(request);
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
