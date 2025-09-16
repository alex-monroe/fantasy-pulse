import { test, expect } from 'playwright/test';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuid } from 'uuid';

test.describe('Matchup Report Page', () => {
  const email = `test-${uuid()}@test.com`;
  const password = 'test';
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let user: any;
  const sleeperIntegrations: any[] = [];
  const yahooIntegrations: any[] = [];
  const ottoneuIntegrations: any[] = [];

  test.beforeAll(async () => {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;

    const insertLeague = async (
      userIntegrationId: number,
      league: {
        league_id: string;
        name: string;
        season: string;
        total_rosters: number;
        status: string;
      }
    ) => {
      const { error: leagueError } = await supabase.from('leagues').insert({
        ...league,
        user_integration_id: userIntegrationId,
        user_id: user.id,
      });
      if (leagueError) throw leagueError;
    };

    const { data: sleeperUser, error: sleeperUserError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'sleeper',
        provider_user_id: 'sleeperUser',
      })
      .select()
      .single();
    if (sleeperUserError) throw sleeperUserError;
    sleeperIntegrations.push(sleeperUser);
    await insertLeague(sleeperUser.id, {
      league_id: 'league1',
      name: 'Mock Sleeper League',
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });

    const { data: sleeperOpponent, error: sleeperOpponentError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'sleeper',
        provider_user_id: 'opponentUser',
      })
      .select()
      .single();
    if (sleeperOpponentError) throw sleeperOpponentError;
    sleeperIntegrations.push(sleeperOpponent);
    await insertLeague(sleeperOpponent.id, {
      league_id: 'league1',
      name: 'Opponent Sleeper League',
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    const { data: yahooOne, error: yahooOneError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'yahoo',
        provider_user_id: 'yahooUser',
        access_token: 'token',
        refresh_token: 'refresh',
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (yahooOneError) throw yahooOneError;
    yahooIntegrations.push(yahooOne);

    const { data: yahooTwo, error: yahooTwoError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'yahoo',
        provider_user_id: 'yahooUser',
        access_token: 'token-2',
        refresh_token: 'refresh',
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (yahooTwoError) throw yahooTwoError;
    yahooIntegrations.push(yahooTwo);

    const { data: ottoneuOne, error: ottoneuOneError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'ottoneu',
        provider_user_id: '2514',
      })
      .select()
      .single();
    if (ottoneuOneError) throw ottoneuOneError;
    ottoneuIntegrations.push(ottoneuOne);
    await insertLeague(ottoneuOne.id, {
      league_id: '309',
      name: 'The SOFA',
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });

    const { data: ottoneuTwo, error: ottoneuTwoError } = await supabase
      .from('user_integrations')
      .insert({
        user_id: user.id,
        provider: 'ottoneu',
        provider_user_id: '2514',
      })
      .select()
      .single();
    if (ottoneuTwoError) throw ottoneuTwoError;
    ottoneuIntegrations.push(ottoneuTwo);
    await insertLeague(ottoneuTwo.id, {
      league_id: '309',
      name: 'The SOFA 2',
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });
  });

  test.afterAll(async () => {
    if (user) {
      const allIntegrations = [
        ...sleeperIntegrations,
        ...yahooIntegrations,
        ...ottoneuIntegrations,
      ];
      for (const integration of allIntegrations) {
        await supabase.from('teams').delete().eq('user_integration_id', integration.id);
        await supabase.from('leagues').delete().eq('user_integration_id', integration.id);
      }
      await supabase.from('user_integrations').delete().eq('user_id', user.id);
      await supabase.auth.admin.deleteUser(user.id);
    }
  });

  test('displays categorized players from multiple providers', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('/');

    await page.goto('/matchup-report');
    await expect(page.getByRole('heading', { name: 'Matchup Report' })).toBeVisible();

    const heroesCard = page.getByText('🦸 Fantasy Heroes').locator('..').locator('..');
    await expect(heroesCard.getByText('Josh Allen')).toBeVisible();
    await expect(heroesCard.getByText('Yahoo Player 1')).toBeVisible();

    const enemiesCard = page.getByText('😈 Public Enemies').locator('..').locator('..');
    await expect(enemiesCard.getByText('Deebo Samuel')).toBeVisible();
    await expect(enemiesCard.getByText('Yahoo Player 2')).toBeVisible();

    const doubleAgentsCard = page.getByText('🕵️ Double Agents').locator('..').locator('..');
    await expect(doubleAgentsCard.getByText('Sleeper Player 1')).toBeVisible();
    await expect(doubleAgentsCard.getByText('Sleeper Player 2')).toBeVisible();
  });
});
