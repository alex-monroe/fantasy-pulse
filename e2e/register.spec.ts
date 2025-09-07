import { test, expect, supabase } from './test-utils';

test.describe('Registration', () => {
  const users: string[] = [];

  test.afterEach(async () => {
    for (const email of users) {
      const {
        data: { user },
      } = await supabase.auth.admin.getUserByEmail(email);
      if (user) {
        await supabase.auth.admin.deleteUser(user.id);
      }
    }
    // Clear the array
    users.length = 0;
  });

  test('user can register', async ({ page }) => {
    const email = `user${Date.now()}@example.com`;
    const password = 'test1234';
    users.push(email);

    await page.goto('/register');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create Account' }).click();
    await expect(page).toHaveURL('/login');
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});
