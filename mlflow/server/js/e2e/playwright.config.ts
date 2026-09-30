import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './utils/mlflowClient';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: './test-report' }]],
  globalSetup: './utils/globalSetup.ts',
  globalTeardown: './utils/globalTeardown.ts',
  timeout: 60000,
  use: {
    baseURL: BASE_URL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
