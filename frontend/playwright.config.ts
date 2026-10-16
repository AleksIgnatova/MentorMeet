import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests: a real browser against a real backend and PostgreSQL.
 *
 * Safety: Playwright always starts its OWN backend and frontend (never reusing
 * running servers), and that backend uses the TEST database only, with
 * NODE_ENV=test (so backend/.env is not read) and no Gemini key (the confirmation
 * page shows the fallback message; no external AI calls).
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mentormeet_test?schema=public';
if (!new URL(TEST_DATABASE_URL).pathname.replace(/^\//, '').endsWith('_test')) {
  throw new Error('E2E tests only run against a database whose name ends with "_test".');
}

// Keep in sync with e2e/helpers.ts.
const API_PORT = 3999;
const WEB_PORT = 5174;
const API_URL = `http://localhost:${API_PORT}/api`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

// Installed Google Chrome by default (no browser download). Set PLAYWRIGHT_CHANNEL=""
// to use Playwright's own Chromium instead (`npx playwright install chromium` first).
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // The tests share one database; run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: WEB_URL,
    ...(channel ? { channel } : {}),
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Bring the test database schema up to date (non-destructive), then start the API.
      command: `npm run db:deploy && npx tsx src/server.ts`,
      cwd: '../backend',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
        PORT: String(API_PORT),
        FRONTEND_URL: WEB_URL,
        GEMINI_API_KEY: '',
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_BASE_URL: API_URL },
    },
  ],
});

