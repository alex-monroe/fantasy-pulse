import { test as base, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (!serviceRoleKey || !supabaseUrl) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set');
}

export const supabase = createClient(supabaseUrl, serviceRoleKey);

export const test = base.extend({
  user: async ({}, use) => {
    const email = `testuser-${Date.now()}@example.com`;
    const password = 'password123';

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`);
    }

    if (!data.user) {
      throw new Error('User not created');
    }

    const user = { ...data.user, email, password };

    await use(user);

    await supabase.auth.admin.deleteUser(user.id);
  },
});

export { expect };
