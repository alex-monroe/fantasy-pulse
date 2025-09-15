import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

const email = `test-${uuid()}@test.com`;
const password = 'test';

test.describe('Ottoneu Matchup Page', () => {
  let user: any;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  test.beforeAll(async () => {
    console.log('Creating user...');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log('User created.');
  });

  test.afterAll(async () => {
    if (user) {
      console.log('Deleting user...');
      await supabase.auth.admin.deleteUser(user.id);
      console.log('User deleted.');
    }
  });

  test('can navigate to the page', async ({ page }) => {
    console.log('Logging in...');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/');
    console.log('Logged in.');

    await page.goto('/integrations/ottoneu/league/309/matchup');
    console.log('Navigated to matchup page.');

    await expect(page.locator('h1')).toHaveText('Ottoneu Matchup');
  });
});
