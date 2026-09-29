import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export const WORKSPACE_ROOT = resolve(__dirname, '../..');
const baseURL = 'http://localhost:4200';

/**
 * End-to-end tests of the whole app: `web` with `api` behind the proxy, on the Postgres
 * and Mailpit from docker-compose.yml. `nx serve web` starts both.
 */
export default defineConfig({
  testDir: './src',
  outputDir: '../../dist/.playwright/apps/web-e2e/test-output',
  reporter: [['list'], ['html', { outputFolder: '../../dist/.playwright/apps/web-e2e/report', open: 'never' }]],
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL,
    locale: 'pl-PL',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx nx run web:serve',
    // `/` has no page yet (404), which Playwright does not take for ready.
    url: `${baseURL}/logowanie`,
    cwd: WORKSPACE_ROOT,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
