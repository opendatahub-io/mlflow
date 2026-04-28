import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: './test-report' }]],

  use: {
    baseURL: process.env.MLFLOW_E2E_BASE_URL || 'http://localhost:5001',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'default',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
