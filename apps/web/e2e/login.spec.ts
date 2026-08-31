import { test, expect } from 'playwright/test';
import { v4 as uuid } from 'uuid';
import { createAdminClient } from './lib/supabase-admin';

const email = `test-${uuid()}@test.com`;
const password = 'testtest';

test.describe('Login', () => {
    let user: { id: string } | undefined;
    const supabase = createAdminClient();

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
