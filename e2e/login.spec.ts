import { test, expect } from 'playwright/test';

test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('test@test.com');
  await page.getByLabel('Password').fill('test');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
});
