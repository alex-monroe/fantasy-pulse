/**
 * Whether the emailed password-reset flow is offered.
 *
 * The self-hosted Supabase at db.rosterloom.com has no SMTP, so
 * `resetPasswordForEmail` succeeds without sending anything. Offering the
 * form there would tell people to check an inbox that never gets mail.
 * Until SMTP is configured, the reset UI is hidden and users ask the admin,
 * who resets the password by hand (docs/SELF_HOSTED_SUPABASE_MIGRATION.md).
 *
 * Opt in with `NEXT_PUBLIC_PASSWORD_RESET_EMAIL=on` once mail works. It's
 * inlined at build time, so flipping it needs a redeploy.
 */
export function isPasswordResetEmailEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PASSWORD_RESET_EMAIL === 'on';
}

/** Shown wherever the "email me a link" option would otherwise appear. */
export const MANUAL_RESET_MESSAGE =
  'Forgot your password? Ask the Roster Loom admin to reset it for you.';
