import { NextResponse } from 'next/server';

import { authorizeCron } from '@/lib/cron-auth';
import { ingestSleeperPlayers } from '@/lib/sleeper-players/pool';
import { invalidateSleeperPlayersCache } from '@/app/actions';

export const dynamic = 'force-dynamic';

/**
 * Refreshes the shared Sleeper player pool in Supabase. Bearer-gated with
 * `CRON_SECRET` (see `authorizeCron`); the `Sleeper Players Ingest` workflow
 * calls it daily. GET and POST behave identically.
 */
async function run(request: Request) {
  const auth = authorizeCron(request, 'Sleeper players ingest');
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const result = await ingestSleeperPlayers();
  if (result.error) {
    return NextResponse.json({ ...result, ok: false }, { status: 502 });
  }

  // This instance may hold the previous pool in memory.
  await invalidateSleeperPlayersCache();
  return NextResponse.json({ ...result, ok: true });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
