import { test, expect } from 'playwright/test';

test.describe('Forgot password', () => {
  test('sign-in offers a way out for a forgotten password', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect(page).toHaveURL('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  });

  test('requesting a link confirms without leaking whether the account exists', async ({ page }) => {
    // Intercept Supabase's recover endpoint: the real one sends mail via
    // the shared OttoneuDB project and is rate limited per hour, which
    // would make this spec flaky for everyone else's runs too.
    let recoverBody: Record<string, unknown> | null = null;
    await page.route('**/auth/v1/recover*', async (route) => {
      recoverBody = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody@test.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await expect(page.getByText(/If an account exists for nobody@test\.com/)).toBeVisible();
    expect(recoverBody).toMatchObject({ email: 'nobody@test.com' });
  });

  test('a spent link lands on sign-in with an explanation', async ({ page }) => {
    // No code or token_hash: the same rejection an expired link gets.
    await page.goto('/auth/callback?next=/reset-password');

    await expect(page).toHaveURL('/login?error=invalid_link');
    await expect(page.getByText(/That link is invalid or has expired/)).toBeVisible();
  });

  test('the reset form asks for a new link when there is no session', async ({ page }) => {
    await page.goto('/reset-password');

    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  });
});
