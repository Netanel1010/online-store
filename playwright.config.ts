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
  // GitHub's runners are slower than a developer machine, so auto-retrying assertions get twice
  // as long there. A genuine failure still fails; it just is not mistaken for a slow machine.
  expect: { timeout: isCI ? 10_000 : 5_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${port}/online-store/`,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    // The hero carousel rotates by itself unless the visitor prefers reduced motion. Tests run
    // with that preference so pages do not change under them; the autoplay test turns it off.
    reducedMotion: 'reduce',
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
