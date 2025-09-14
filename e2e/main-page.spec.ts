import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

const email = `test-${uuid()}@test.com`;
const password = 'test';

test.describe('Main Page', () => {
  let user: any;
  let sleeperIntegration: any;
  let yahooIntegration: any;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  test.beforeAll(async () => {

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;

    // Insert mock integrations and leagues
    const { data: sleeper, error: sleeperError } = await supabase
      .from('user_integrations')
      .insert({ user_id: user.id, provider: 'sleeper', provider_user_id: 'sleeperUser' })
      .select()
      .single();
    if (sleeperError) throw sleeperError;
    sleeperIntegration = sleeper;

    await supabase.from('leagues').insert({
      league_id: 'league1',
      name: 'Mock Sleeper League',
      user_integration_id: sleeper.id,
      user_id: user.id,
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });

    const { data: yahoo, error: yahooError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'yahoo',
        provider_user_id: 'yahooUser',
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      })
      .select()
      .single();
    if (yahooError) throw yahooError;
    yahooIntegration = yahoo;
  });

  test.afterAll(async () => {
    if (user) {
      await supabase.from('teams').delete().eq('user_integration_id', yahooIntegration.id);
      await supabase.from('leagues').delete().eq('user_id', user.id);
      await supabase.from('user_integrations').delete().eq('user_id', user.id);
      await supabase.auth.admin.deleteUser(user.id);
    }
  });

  test('displays teams from mocked APIs', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/');

    // Wait briefly so test videos capture the rendered teams before assertions
    await page.waitForTimeout(3000);

    await expect(page.getByText('Weekly Matchups')).toBeVisible();
    await expect(page.getByText('Sleeper Squad')).toBeVisible();
    await expect(page.getByText('Yahoo Warriors')).toBeVisible();

    // Verify matchup scores
    await expect(page.getByText('10.0')).toBeVisible();
    await expect(page.getByText('8.0')).toBeVisible();
    await expect(page.getByText('100.0')).toBeVisible();
    await expect(page.getByText('90.0')).toBeVisible();

    // Verify player cards
    await expect(page.getByText('Sleeper Player 1')).toBeVisible();
    await expect(page.getByText('Sleeper Player 2')).toBeVisible();
    await expect(page.getByText('Yahoo Player 1')).toBeVisible();
    await expect(page.getByText('Yahoo Player 2')).toBeVisible();
  });
});
