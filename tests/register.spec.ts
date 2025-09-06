import { test, expect } from '@playwright/test';

// Use a unique email so repeated runs don't conflict
function uniqueEmail() {
  return `user${Date.now()}@test.com`;
}

test('user can register a new account', async ({ page }) => {
  await page.goto('/register');
  await page.fill('input[id="email"]', uniqueEmail());
  await page.fill('input[id="password"]', 'test');
  await page.click('button[type="submit"]');

  // After successful registration, the app redirects to the login page
  await expect(page).toHaveURL(/\/login$/);
});
