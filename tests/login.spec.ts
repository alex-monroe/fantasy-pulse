import { test, expect } from '@playwright/test';

// Credentials defined in AGENTS.md
const EMAIL = 'test@test.com';
const PASSWORD = 'test';

test('user can log in with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[id="email"]', EMAIL);
  await page.fill('input[id="password"]', PASSWORD);
  await page.click('button[type="submit"]');

  // Expect to navigate to the home page and see the Sign Out button
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
});
