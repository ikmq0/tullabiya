import { defineConfig, devices } from '@playwright/test';

// E2E runs against the built site so what is tested is what ships.
// Set PW_DEV=1 to point at an already-running `npm run dev` instead.
const dev = !!process.env.PW_DEV;
// 4322, not the dev server's 4321, so the suite always runs against a fresh production build.
const baseURL = 'http://127.0.0.1:4322';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: dev ? 'npx astro dev --host 127.0.0.1 --port 4322' : 'npm run build && npx astro preview --force --host 127.0.0.1 --port 4322',
    url: baseURL + '/ar/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
