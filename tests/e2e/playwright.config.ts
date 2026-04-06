import { defineConfig } from '@playwright/test';

const browserName =
  process.env.PLAYWRIGHT_BROWSER === 'firefox' ? 'firefox' : 'chromium';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    browserName,
    ...(browserName === 'chromium' ? { channel: 'chromium' as const } : {}),
    headless: true,
    viewport: { width: 1280, height: 900 },
  },
  workers: process.env.CI ? 2 : browserName === 'firefox' ? 1 : undefined,
});
