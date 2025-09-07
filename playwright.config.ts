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
    env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    }
  },
});
