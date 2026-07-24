import type { Team } from '@roster-loom/core';

import { supabase } from '@/lib/supabase';

const rawBase = process.env.EXPO_PUBLIC_API_URL;
if (!rawBase) {
  throw new Error(
    'Missing EXPO_PUBLIC_API_URL. Copy apps/mobile/.env.example to .env.local and fill it in.',
  );
}
const API_BASE = rawBase.replace(/\/+$/, '');

/**
 * When set (any truthy value), the app opts into the web backend's demo
 * mode by sending an `x-demo-mode` header, so it renders deterministic,
 * self-updating fake data instead of real provider data. See
 * docs/DEMO_MODE.md.
 */
export const DEMO_MODE =
  /^(1|true|on|yes)$/i.test(process.env.EXPO_PUBLIC_DEMO_MODE ?? '');

export type TeamsResponse = { teams: Team[] } | { error: string };

/**
 * Fetches the user's teams + scores from the web app's /api/teams/refresh
 * endpoint. Authenticates with the current Supabase session JWT.
 *
 * Returns `{ teams }` on success, `{ error }` on auth/server failure.
 */
export async function fetchTeams(): Promise<TeamsResponse> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return { error: sessionError.message };
  const token = data.session?.access_token;
  if (!token) return { error: 'Not signed in.' };

  const response = await fetch(`${API_BASE}/api/teams/refresh`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(DEMO_MODE ? { 'x-demo-mode': '1' } : {}),
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { error: `HTTP ${response.status}: response was not JSON` };
  }

  if (!response.ok || (body && typeof body === 'object' && 'error' in body)) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `HTTP ${response.status}`;
    return { error: message };
  }

  return body as TeamsResponse;
}
