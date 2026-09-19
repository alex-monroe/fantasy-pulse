import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';

import { safeRedirectPath } from '@/lib/safe-redirect';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * The OTP types Supabase can send a user here with. Anything else in
 * `?type=` is treated as a malformed link rather than passed through to
 * `verifyOtp`.
 */
const OTP_TYPES: readonly EmailOtpType[] = [
  'recovery',
  'email',
  'signup',
  'invite',
  'magiclink',
  'email_change',
];

/**
 * Turns an emailed auth link into a session cookie.
 *
 * Supabase sends users here two different ways depending on how the
 * email template is written, and both have to work:
 *
 * - `?code=…` — the default PKCE link. The verifier was stored as a
 *   cookie when the reset was requested, so the exchange only succeeds
 *   in the browser that asked for it.
 * - `?token_hash=…&type=recovery` — the `{{ .TokenHash }}` template.
 *   No verifier involved, so the link also works when the user opens
 *   their mail on a different device. See docs/AUTH.md.
 *
 * On success the browser is sent to `next` (a same-origin path, e.g.
 * `/reset-password`) now carrying a session. On failure it goes to
 * `/login` with an error *code* — never a message lifted from the URL,
 * which would let anyone put their own text on our login page.
 *
 * @param request - The incoming request.
 * @returns A redirect to `next`, or to `/login` when the link is bad.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeRedirectPath(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL('/login?error=invalid_link', origin));
}
