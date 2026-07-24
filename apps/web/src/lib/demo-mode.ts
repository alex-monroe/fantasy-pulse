/**
 * Demo mode: serve deterministic, self-updating fake data instead of
 * hitting the real fantasy providers, so the live scoreboard can be
 * exercised out of season and outside game windows. See docs/DEMO_MODE.md.
 *
 * A single seam (`getTeams`) short-circuits when demo mode is on, which
 * means the web render, the web "Refresh" button, and the mobile app (it
 * calls the same `/api/teams/refresh` endpoint) all get demo data with no
 * per-app plumbing.
 *
 * Demo mode is enabled by any of, in order of scope:
 *  - `DEMO_MODE=1` server env var — flips the whole instance.
 *  - the `rl_demo` cookie set to a truthy value (web sessions opt in via
 *    `?demo=1`, cleared with `?demo=0`; the cookie is set by middleware).
 *  - the `x-demo-mode: 1` request header (how the mobile app opts in via
 *    its `EXPO_PUBLIC_DEMO_MODE` build flag).
 */

/** Cookie that opts a browser session into demo mode. */
export const DEMO_COOKIE = 'rl_demo';
/** Query param that toggles the demo cookie (`1` on, `0` off). */
export const DEMO_QUERY_PARAM = 'demo';
/** Header non-browser clients (mobile) send to opt into demo mode. */
export const DEMO_HEADER = 'x-demo-mode';

function isTruthy(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

/**
 * Whether demo mode is enabled instance-wide via the `DEMO_MODE` env var.
 * This is the primary switch for a dedicated demo deployment.
 */
export function isDemoModeEnv(): boolean {
  return isTruthy(process.env.DEMO_MODE);
}

/**
 * Resolves whether a request should be served demo data, combining the
 * env-wide switch with per-request opt-ins (cookie or header).
 *
 * @param signals.cookieValue - Value of the `rl_demo` cookie, if present.
 * @param signals.headerValue - Value of the `x-demo-mode` header, if present.
 */
export function resolveDemoMode(signals: {
  cookieValue?: string | null;
  headerValue?: string | null;
}): boolean {
  return (
    isDemoModeEnv() ||
    isTruthy(signals.cookieValue) ||
    isTruthy(signals.headerValue)
  );
}

/**
 * Parses a `?demo=` query value into an explicit on/off toggle, or `null`
 * when the param is absent (leave the cookie as-is).
 */
export function parseDemoQueryToggle(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  return isTruthy(value);
}
