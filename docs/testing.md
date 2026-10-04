# Testing

| Layer               | Tool                           | Where                         | Run                                           |
| ------------------- | ------------------------------ | ----------------------------- | --------------------------------------------- |
| Unit and components | Vitest + React Testing Library | `src/**/*.test.ts(x)` (jsdom) | `npm test`                                    |
| End-to-end          | Playwright (Chromium)          | `e2e/*.spec.ts`               | `npm run test:e2e`                            |
| Accessibility       | axe-core via Playwright        | `e2e/accessibility.spec.ts`   | `npm run test:e2e`                            |
| Static checks       | ESLint, TypeScript, Prettier   | whole repo                    | `npm run lint` / `typecheck` / `format:check` |

## Why two runners

jsdom has no real layout, CSS, history or storage persistence, and no native `<dialog>`. The unit
and component tests cover logic and behaviour quickly. The browser tests cover what jsdom cannot:
responsive visibility, the mobile menu as a real modal dialog, reload and back/forward, persistence
in real `localStorage`, WebCrypto, keyboard focus, colour contrast, and the production build under
the GitHub Pages base path. Vitest ignores `e2e/`; Playwright ignores `src/`.

## End-to-end tests

- They run against the **production build**, served by `e2e/support/pages-server.mjs`, a small
  server that behaves like GitHub Pages: the site lives under `/online-store/`, and a path with no
  file answers with `404.html` and a 404 status. `vite preview` would hide both behaviours.
- `npm run test:e2e` builds first (Playwright's `webServer`), so it never tests a stale `dist/`.
  The first run on a machine needs the browser: `npx playwright install chromium`.
- **Isolation:** every test gets a fresh browser context, so accounts, cart, favorites and the
  session never leak between tests. Each test registers its own throwaway account with a unique
  email; nothing is seeded and no test credentials are real.
- **Deterministic data:** the tests read the same static `public/data/products.json` the app serves
  and compute their expectations from it. No network services are involved.
- **Safety net:** `e2e/support/test.ts` fails any test on an uncaught error, console error, failed
  request or failing asset. Only the console echo of a deep link's own `404.html` response is
  ignored.
- URL-driven pages apply navigation a moment after a click, so tests wait for the URL (or use
  auto-retrying assertions) before reading the page, rather than sleeping.

## Accessibility tests

Automated checks (axe-core, WCAG 2.0/2.1 A and AA rules) find only part of the problems.
Passing them does **not** mean the site is accessible or WCAG-compliant: screen-reader behaviour,
content quality and many criteria need manual review. Alongside the scans, the tests assert
language and direction, accessible names, labels, error associations, keyboard order, focus
management and the mobile menu dialog.

## CI

`.github/workflows/ci.yml` runs two parallel jobs on every pull request and push to `main`:

1. **verify**: `npm ci`, format check, lint, typecheck, unit tests, build.
2. **e2e**: `npm ci`, install Chromium, build and serve the site, run the Playwright suite. On
   failure the HTML report, screenshots and traces are kept as an artifact for 7 days
   (`playwright-report/` and `test-results/` are git-ignored and never committed).

A test that only passes on its retry is reported as **flaky** in the log and the HTML report, so
it is visible rather than hidden. In CI Playwright retries a failed test once and gives assertions
10 s instead of 5 s, because the runners are slower than a developer machine.
