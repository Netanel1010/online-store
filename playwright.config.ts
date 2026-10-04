import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.E2E_PORT ?? 4173)
const isCI = Boolean(process.env.CI)

/**
 * End-to-end tests run against the production build, served the way GitHub Pages serves it
 * (under /online-store/, with 404.html as the fallback), so they exercise the real base path,
 * bundled assets and deep links. Every test gets a fresh browser context, so no test sees the
 * accounts, cart, favorites or session of another.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}/online-store/`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build first so the tests never run against a stale dist/.
    command: 'npm run build && node e2e/support/pages-server.mjs',
    url: `http://localhost:${port}/online-store/`,
    reuseExistingServer: !isCI,
    timeout: 180_000,
    env: { E2E_PORT: String(port) },
  },
})
