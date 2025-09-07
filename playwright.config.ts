import { defineConfig } from 'playwright/test';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:9002',
    video: 'on',
  },
  webServer: {
    command: 'npm run dev',
    port: 9002,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
