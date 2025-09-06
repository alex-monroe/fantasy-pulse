import { test, expect } from 'playwright/test';

test('user can register', async ({ page }) => {
  const email = `user${Date.now()}@example.com`;
  const password = 'test1234';

  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
});
