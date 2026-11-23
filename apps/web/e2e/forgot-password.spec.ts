import { test, expect } from 'playwright/test';

// The self-hosted Supabase has no SMTP, so the emailed reset flow is off
// unless NEXT_PUBLIC_PASSWORD_RESET_EMAIL=on (see src/lib/password-reset.ts).
// CI runs with it off; the flag-on form is covered by the Jest tests.
test.describe('Forgot password (email reset off)', () => {
  test('sign-in points a forgotten password at the admin', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/Ask the Roster Loom admin/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toHaveCount(0);
  });

  test('an old /forgot-password bookmark explains instead of offering a form', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(page.getByText(/Ask the Roster Loom admin/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send reset link' })).toHaveCount(0);
  });

  test('a spent link lands on sign-in with an explanation', async ({ page }) => {
    // No code or token_hash: the same rejection an expired link gets.
    await page.goto('/auth/callback?next=/reset-password');

    await expect(page).toHaveURL('/login?error=invalid_link');
    await expect(page.getByText(/That link is invalid or has expired/)).toBeVisible();
  });

  test('the reset form points at the admin when there is no session', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByText(/Ask the Roster Loom admin/)).toBeVisible();
  });
});
