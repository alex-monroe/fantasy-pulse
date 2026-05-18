import { test, expect } from 'playwright/test';

test('user can register', async ({ page }) => {
  const email = `user${Date.now()}@example.com`;
  const password = 'test1234';

  // Intercept Supabase signUp so the test doesn't depend on project-level
  // email-domain validation (the shared OttoneuDB project rejects
  // @example.com) or shared signup rate limits.
  await page.route('**/auth/v1/signup*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          email,
          aud: 'authenticated',
          role: 'authenticated',
        },
        session: null,
      }),
    });
  });

  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});
