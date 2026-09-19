/**
 * Bearer-token gate for endpoints that write shared, all-users data on a
 * schedule (news ingest, Sleeper player-pool ingest).
 *
 * The caller must present `CRON_SECRET`. When it is unset the endpoint is
 * disabled rather than open — an unauthenticated write path that appears
 * whenever an env var is forgotten is the wrong default.
 *
 * @param request - The incoming request.
 * @param feature - Human-readable name used in the "disabled" message.
 * @returns Whether the caller is authorized, and why not when it isn't.
 */
export function authorizeCron(
  request: Request,
  feature: string
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: `${feature} is disabled: CRON_SECRET is not configured.`,
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const presented = header.replace(/^bearer\s+/i, '').trim();

  if (!presented || presented !== secret) {
    return { ok: false, status: 401, error: 'Unauthorized.' };
  }

  return { ok: true };
}
