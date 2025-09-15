import { Page } from 'playwright/test';

export async function setupOttoneuIntegration(page: Page, url: string) {
  await page.route(
    'https://ottoneu.fangraphs.com/football/309/team/2540',
    async (route) => {
      await route.fulfill({ path: 'e2e/goldens/ottoneu_team_page.html' });
    }
  );
  await page.route(
    'https://ottoneu.fangraphs.com/football/309/game/7282725',
    async (route) => {
      await route.fulfill({ path: 'e2e/goldens/ottoneu_matchup_page.html' });
    }
  );
  await page.goto(url);
}
