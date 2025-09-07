import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';

const email = 'test@test.com';
const password = 'test';

test.describe('Login', () => {
    let user;
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

    test.beforeAll(async () => {
        // clean up user if it exists
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users.find(u => u.email === email);
        if (existingUser) {
            await supabase.auth.admin.deleteUser(existingUser.id);
        }

        // create user
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });
        if(error) throw error;
        user = data.user;
    });

    test.afterAll(async () => {
        if(user) {
            await supabase.auth.admin.deleteUser(user.id);
        }
    });

    test('should be able to login', async ({ page }) => {
        await page.goto('/login');
        await page.getByLabel('Email').fill(email);
        await page.getByLabel('Password').fill(password);
        await page.getByRole('button', { name: 'Sign In' }).click();
        await page.waitForNavigation();
        await expect(page).toHaveURL('/');
        await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    });
});
