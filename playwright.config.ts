import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
export const AI_PORT = 4174;

export default defineConfig({
  testDir: 'tests/e2e',
  // Three browsers share one local server; allow for a loaded machine.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      // Production build served by the real local server, with a fresh data folder (AI off).
      command: `npm run build && rm -rf .tmp-test/e2e && AKSHAR_DATA_DIR=.tmp-test/e2e PORT=${PORT} node server/index.ts`,
      port: PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Same app with a scripted AI stand-in (tests/e2e/ai-server.ts) for the AI specs.
      command: `rm -rf .tmp-test/e2e-ai && AKSHAR_DATA_DIR=.tmp-test/e2e-ai PORT=${AI_PORT} node tests/e2e/ai-server.ts`,
      port: AI_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
