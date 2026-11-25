import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createApiClient } from '@/utils/supabase/api';
import { refreshUserLeagueScoring } from '@/lib/league-scoring/refresh-user';
import logger from '@/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * Reads or infers scoring settings for the signed-in user's Yahoo, ESPN and
 * Ottoneu leagues whose stored settings are missing or stale.
 *
 * The scoreboard calls this once after rendering when any league reports
 * `scoring.stale`, so the provider reads stay off the render path. The
 * response says whether anything changed; the caller refreshes its teams if
 * so.
 *
 * Body (optional JSON): `{ force?: boolean, provider?: string, leagueId?: string }`.
 * Auth: cookies for the web app; `Authorization: Bearer <jwt>` for the mobile app.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  const isBearer = authHeader?.toLowerCase().startsWith('bearer ') ?? false;
  const supabase = isBearer && authHeader ? createApiClient(authHeader) : createClient();
  const token = isBearer && authHeader ? authHeader.replace(/^bearer\s+/i, '').trim() : undefined;
  const { data, error: authError } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (authError || !data?.user) {
    return NextResponse.json({ error: 'You must be logged in.' }, { status: 401 });
  }

  let body: { force?: boolean; provider?: string; leagueId?: string } = {};
  try {
    body = await request.json();
  } catch {
    // No body: refresh whatever is stale.
  }

  try {
    const { refreshed, error } = await refreshUserLeagueScoring(supabase, data.user.id, {
      force: Boolean(body.force),
      only: body.provider && body.leagueId ? { provider: body.provider, providerLeagueId: body.leagueId } : undefined,
    });
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json({
      changed: refreshed.length > 0,
      leagues: refreshed.map((league) => ({
        provider: league.provider,
        leagueId: league.providerLeagueId,
        source: league.source,
        matchRate: league.inference?.matchRate ?? null,
      })),
    });
  } catch (error) {
    logger.error({ userId: data.user.id, err: error }, 'league-scoring: refresh endpoint failed');
    return NextResponse.json({ error: 'Failed to refresh league scoring.' }, { status: 500 });
  }
}
