import { test, expect } from 'playwright/test';
import { v4 as uuid } from 'uuid';
import { createAdminClient } from './lib/supabase-admin';

const email = `test-${uuid()}@test.com`;
const password = 'testtest';

test.describe('Main Page', () => {
  let user: any;
  let sleeperIntegration: any;
  let yahooIntegration: any;
  let ottoneuIntegration: any;
  const supabase = createAdminClient();

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
      .from('fp_user_integrations')
      .insert({ user_id: user.id, provider: 'sleeper', provider_user_id: 'sleeperUser' })
      .select()
      .single();
    if (sleeperError) throw sleeperError;
    sleeperIntegration = sleeper;

    await supabase.from('fp_leagues').insert({
      league_id: 'league1',
      name: 'Mock Sleeper League',
      user_integration_id: sleeper.id,
      user_id: user.id,
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });

    const { data: yahoo, error: yahooError } = await supabase
      .from('fp_user_integrations')
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

    const { data: ottoneu, error: ottoneuError } = await supabase
      .from('fp_user_integrations')
      .insert({
        user_id: user.id,
        provider: 'ottoneu',
        provider_user_id: '2514',
      })
      .select()
      .single();
    if (ottoneuError) throw ottoneuError;
    ottoneuIntegration = ottoneu;

    await supabase.from('fp_leagues').insert({
      league_id: '309',
      name: 'The SOFA',
      user_integration_id: ottoneu.id,
      user_id: user.id,
      season: '2024',
      total_rosters: 2,
      status: 'in_season',
    });
  });

  test.afterAll(async () => {
    if (user) {
      await supabase
        .from('fp_teams')
        .delete()
        .eq('user_integration_id', yahooIntegration.id);
      await supabase
        .from('fp_teams')
        .delete()
        .eq('user_integration_id', ottoneuIntegration.id);
      await supabase.from('fp_leagues').delete().eq('user_id', user.id);
      await supabase.from('fp_user_integrations').delete().eq('user_id', user.id);
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

    await expect(page.getByText('Sleeper Squad')).toBeVisible();
    await expect(page.getByText('Yahoo Warriors')).toBeVisible();
    await expect(page.getByText('The Witchcraft')).toBeVisible();

    // Verify matchup scores. Address the league's tile in the week
    // scoreboard rather than matching loose page text: a bare
    // getByText('10.0') also hits position-band totals and the
    // differential chips, which is a strict-mode violation.
    const tileFor = (teamName: string) =>
      page.getByTestId('matchup-tile').filter({ hasText: teamName });

    const expectMatchup = async (
      teamName: string,
      teamScore: string,
      opponentScore: string,
    ) => {
      await expect(tileFor(teamName).getByTestId('matchup-team-score')).toHaveText(
        teamScore,
      );
      await expect(
        tileFor(teamName).getByTestId('matchup-opponent-score'),
      ).toHaveText(opponentScore);
    };

    await expectMatchup('Sleeper Squad', '10.0', '8.0');
    await expectMatchup('Yahoo Warriors', '100.0', '90.0');
    // The Ottoneu golden has The Witchcraft away at 0.00 against
    // The Triple Helix at 40.10.
    await expectMatchup('The Witchcraft', '0.0', '40.1');

    // Verify player cards
    await expect(page.getByText('Sleeper Player 1')).toBeVisible();
    await expect(page.getByText('Sleeper Player 2')).toBeVisible();
    await expect(page.getByText('Yahoo Player 1')).toBeVisible();
    await expect(page.getByText('Yahoo Player 2')).toBeVisible();
    await expect(page.getByText('Josh Allen')).toBeVisible();
    await expect(page.getByText('Breece Hall')).toBeVisible();
  });
});
