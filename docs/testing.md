# Testing

| Layer               | Tool                           | Where                         | Run                                           |
| ------------------- | ------------------------------ | ----------------------------- | --------------------------------------------- |
| Unit and components | Vitest + React Testing Library | `src/**/*.test.ts(x)` (jsdom) | `npm test`                                    |
| API                 | Vitest (Node)                  | `server/src/**/*.test.ts`     | `npm run test:server`                         |
| End-to-end          | Playwright (Chromium)          | `e2e/*.spec.ts`               | `npm run test:e2e`                            |
| Accessibility       | axe-core via Playwright        | `e2e/accessibility.spec.ts`   | `npm run test:e2e`                            |
| Static checks       | ESLint, TypeScript, Prettier   | whole repo                    | `npm run lint` / `typecheck` / `format:check` |

## Why two runners

jsdom has no real layout, CSS, history or storage persistence, and no native `<dialog>`. The unit
and component tests cover logic and behaviour quickly. The browser tests cover what jsdom cannot:
responsive visibility, the mobile menu as a real modal dialog, reload and back/forward, persistence
in real `localStorage`, a session across two origins, keyboard focus, colour contrast, and the production build under
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
- **Deterministic data:** the site loads its products from an API, which in these tests is
  `e2e/support/api-server.mjs`: the real API code (routes, service, validation, paging, error
  format) over the in-memory repository the API's own tests use, filled from
  `public/data/products.json` (the file `npm run seed:products` copies to MongoDB). The tests read
  the same file and compute their expectations from it. The build gets the stub's address through
  `VITE_API_URL`, and Playwright starts both servers. No MongoDB, production API or other network
  service is involved.
- **Safety net:** `e2e/support/test.ts` fails any test on an uncaught error, console error, failed
  request or failing asset. Only the console echo of a deep link's own `404.html` response is
  ignored.
  A request the page cancels on purpose (a filter changes while the listing loads) is the one
  exception, and it is not recognised by its error text: the page reports every request whose
  `AbortSignal` it aborts, and only an `ERR_ABORTED` fetch for an address the page itself
  cancelled is excused (`e2e/support/requestFailures.ts`, tested by `e2e/safety-net.spec.ts`).
  Any other failure, including an abort the page did not cause, still fails the test.
- URL-driven pages apply navigation a moment after a click, so tests wait for the URL (or use
  auto-retrying assertions) before reading the page, rather than sleeping.

## API tests

`npm run test:server` runs the API's Vitest suite in a Node environment. It needs **no MongoDB and
no credentials**, so CI runs it as it is: the driver is replaced by a stand-in, the products
service and routes run over an in-memory repository, and the entry point and the seed command are
started as real processes to check their failure paths. An optional integration suite talks to a
real MongoDB; `npm run test:server` skips it (it stays quick and needs nothing), and CI runs it with
`npm run test:integration` against a throwaway MongoDB (below). Details:
[`server/README.md`](../server/README.md#tests).

The search, filters, sorting and filter options of the listings are covered at three levels: the
query parser (`listQuery.test.ts`), the service over the real catalog and small hand-checked
products (`service.listing.test.ts`, `facets.test.ts`), and over HTTP (`routes.test.ts`). The MongoDB
filters are evaluated on the real catalog without a database (`productFilter.test.ts`,
`searchFields.test.ts`), and the exact queries sent to the driver are checked in
`repository.test.ts`.

## Listing pages in the component tests

The products, category and search pages ask the API for what they show, so their component tests
(`renderApp` in `src/test`) answer them with `fakeListingApi`: the **real API code** (the query
parser, the search, the filters, the sort and the filter options) over the products of the test, in
memory, reached through the storefront's own request path. These tests therefore check what the
page sends and what it gets back, not a script, and the filtering rules are written only once.
`src/services/productService.listing.test.ts` and `src/features/products/useProductListing.test.tsx`
cover the request, the answer's validation and the loading, refreshing and error states.

## Authentication in the tests

The sign-in, registration, guard and checkout component tests call `setUpAuthApi` (`src/test/authApi.ts`):
the **real API code** (routes, validation, scrypt hashing, sessions, middleware, error handling) over
accounts and sessions in memory, on a free port, reached by the storefront's own requests. They
check what the pages send and get back, and a test can end every session on the "server" to see
what the page does when its token stops working. `authService.test.ts` and `authStore.test.ts` cover
how the answers (401, 409, 429, 5xx, no network) are read and what is kept in the browser.

The E2E tests register real accounts in the stub API that runs the same code, on another origin
than the site (like the deployed site and API), and check, in a real browser, that the token goes
in an `Authorization` header and no cookie is sent, that a session survives a reload, that signing
out ends it on the server, that a token the server has ended signs nobody in, and that two browsers
are two sessions.

## Accessibility tests

Automated checks (axe-core, WCAG 2.0/2.1 A and AA rules) find only part of the problems.
Passing them does **not** mean the site is accessible or WCAG-compliant: screen-reader behaviour,
content quality and many criteria need manual review. Alongside the scans, the tests assert
language and direction, accessible names, labels, error associations, keyboard order, focus
management and the mobile menu dialog.

## CI

`.github/workflows/ci.yml` runs three parallel jobs on every pull request and push to `main`:

1. **verify**: `npm ci`, format check, lint, typecheck, unit tests, API tests, the site build (with
   `VITE_API_URL` from the `API_URL` repository variable) and the API build.
2. **integration**: the tests of the code that talks to MongoDB (queries, unique indexes, sorting,
   the index that expires sessions) against a real MongoDB 8 that exists only for the job: a
   GitHub Actions service container, so Docker is not a dependency of the project. The job sets
   `MONGODB_TEST_URI=mongodb://localhost:27017`; no secret and no production address is available
   to it, and the tests only use databases named `online_store_test_<random>`, which they drop.
   `npm run test:integration` refuses to start without that address, so these tests can never pass
   by being skipped, and a failing test fails the job.
3. **e2e**: `npm ci`, install Chromium, build and serve the site and the stub API, run the
   Playwright suite. On failure the HTML report, screenshots and traces are kept as an artifact
   for 7 days (`playwright-report/` and `test-results/` are git-ignored and never committed).

On pushes to `main`, a fourth job, **deploy**, runs only if all three succeeded: it checks the production
API (`npm run check:api`) and then publishes the site to GitHub Pages. See
[`deployment.md`](deployment.md).

A test that only passes on its retry is reported as **flaky** in the log and the HTML report, so
it is visible rather than hidden. In CI Playwright retries a failed test once and gives assertions
10 s instead of 5 s, because the runners are slower than a developer machine.
