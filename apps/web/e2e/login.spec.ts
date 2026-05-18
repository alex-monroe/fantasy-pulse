import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

const email = `test-${uuid()}@test.com`;
const password = 'test';

test.describe('Login', () => {
    let user;
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

    test.beforeAll(async () => {

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
