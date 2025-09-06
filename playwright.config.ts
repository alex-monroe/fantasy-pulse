import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:9002',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:9002',
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
