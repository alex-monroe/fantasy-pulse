import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';

test('user can register', async ({ page }) => {
  const email = `user${Date.now()}@example.com`;
  const password = 'test1234';

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = serviceRoleKey
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey
      )
    : null;

  try {
    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  } finally {
    if (supabase) {
      const { data } = await supabase.auth.admin.listUsers({ email });
      const user = data.users?.[0];
      if (user) {
        await supabase.auth.admin.deleteUser(user.id);
      }
    }
  }
});
