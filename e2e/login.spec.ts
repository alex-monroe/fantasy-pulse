import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';

test('user can log in', async ({ page }) => {
  const email = 'test@test.com';
  const password = 'test';

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required for this test');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey!
  );

  try {
    const {
      data: { user: existingUser },
    } = await supabase.auth.admin.getUserByEmail(email);
    if (existingUser) {
      await supabase.auth.admin.deleteUser(existingUser.id);
    }

    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
  } finally {
    const {
      data: { user },
    } = await supabase.auth.admin.getUserByEmail(email);
    if (user) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  }
});
