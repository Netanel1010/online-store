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
  email; nothing is seeded and no test credentials are real. A cart and the orders belong to an
  account, so no test sees another's.
- **Deterministic data:** the site loads its products, accounts, carts and orders from an API, which
  in these tests is `e2e/support/api-server.mjs`: the real API code (routes, service, validation,
  paging, error format) over the in-memory repositories the API's own tests use, filled from
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
started as real processes to check their failure paths. The carts and the orders have the same layers (schemas, service, repository queries, routes over
HTTP with in-memory repositories), including that an account can only reach its own cart and its own
orders, the idempotent writes, and that CORS lets the storefront's `PUT`, `DELETE` and
`Idempotency-Key` through. An optional integration suite talks to a
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

The pages ask the API for what they show, so their component tests (`renderApp` in `src/test`)
answer them with `fakeCatalogApi`: the **real API code** (the query parser, the search, the filters,
the sort, the filter options, the lookup by id, the sale and recommended lists, the category counts
and the suggestions) over the products of the test, in memory, reached through the storefront's own
request paths. These tests therefore check what the
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

## Carts, orders and cart synchronization in the tests

`setUpAuthApi` also serves the **real cart and order routes** (their validation, pricing, idempotency,
ownership and error answers) over in-memory repositories, so the checkout, the order pages and the
cart page are tested against what the API really answers. `setCatalog` gives it the products that
orders are priced from and that can be put in a cart, and `api.carts()` / `api.orders()` show what it
stored.

The synchronization of the cart (`src/features/cart/cartSync.ts`) is tested at three levels:

- `cartSyncPlan.test.ts`: the two pure rules, what to send so that the API's cart becomes the
  browser's (`planChanges`) and how two carts are joined (`mergeCarts`, the larger quantity, never
  the sum).
- `cartSync.test.ts`: the engine against the real cart routes. Signing in (a cart filled in while
  signed out is joined, a copy with unsent changes is sent, a clean copy or another account's is
  replaced), sending what is added, changed, removed and emptied, a burst of clicks becoming one
  request, a line another device added being left alone, a product the API refuses or a full cart,
  the API being unreachable or ending the session, and signing out. Debounce and retry delays are set
  per test (`cartSyncPolicy`; `src/test/setup.ts` makes them immediate), so there are no sleeps to
  tune.
- `src/pages/cartSync.test.tsx` and the checkout tests: the whole app, including that an empty cart
  shows "loading" and not "the cart is empty" until the account's cart has arrived.

In the browser, `e2e/cart-sync.spec.ts` checks that signing out empties this browser and signing in
brings the cart back, that a browser that has never seen the cart reads it from the API, that a cart
filled in while signed out joins the account's at sign-in, and that a change on the cart page is
saved. The E2E tests also place orders and read the order history through the same stub API
(`e2e/auth-checkout.spec.ts`, `e2e/orders.spec.ts`).

## Accessibility tests

Automated checks (axe-core, WCAG 2.0 to 2.2 A and AA rules) find only part of the problems.
Passing them does **not** mean the site is accessible or WCAG-compliant: screen-reader behaviour,
content quality and many criteria need manual review. Alongside the scans, the tests assert
language and direction, accessible names, labels, error associations, keyboard order, focus
management and the mobile menu dialog.

## Quality checks beyond the test suites

Three checks that are not tests of behaviour, each with one job:

| Check                    | Command and place                                                                  | What it guards                                                                                                                                       | Can it fail a pull request? |
| ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Weight of the first page | `npm run check:bundle`, in `verify` after the build                                | the JavaScript (160 KiB) and CSS (16 KiB) that `index.html` loads up front, after gzip; today 133 KiB and 7.7 KiB. `scripts/bundleBudget.mjs`        | yes, and it blocks a deploy |
| Lighthouse               | `lighthouse.yml`, budgets in `lighthouserc.json`                                   | accessibility at least 0.95, best practices and SEO at least 0.9, layout shift at most 0.25 (errors); performance at least 0.6 (warning)             | yes, but not a deploy gate  |
| Production smoke         | `smoke.yml` every night and by hand: `check-api.mjs` (strict) and `check-site.mjs` | the deployed API and the deployed site, from outside: health, products, CORS, headers, catalog drift; home page, a static product page, sitemap, 404 | no (it runs on a schedule)  |

**Lighthouse** runs three times on each of the home page, the listing and a product page, against the
production build served like GitHub Pages with the stub API of the browser tests, and judges the
median. A size is not asserted there: the test server does not compress, so Lighthouse would see
sizes that GitHub Pages never sends; that is what `check:bundle` is for. Performance is a warning
because a timing on a shared runner varies (about 0.65 to 0.76 on the three pages in M12).
**Known finding:** the layout shift of the listing page is 0.20 (the budget is 0.25, the "good"
threshold is 0.1): the page jumps when the products replace the loading skeletons.

**The smoke test is read-only**: it creates no account and no data, and checks only public addresses.
It does not sign in; an authenticated smoke test would need an account kept for the purpose and its
credentials as a secret, and was not added. See the [runbook](runbook.md#the-nightly-smoke-test) for
what a red run means. The accessibility checks, including the manual pass, are in
[`accessibility.md`](accessibility.md).

## CI

`.github/workflows/ci.yml` runs three parallel jobs on every pull request and push to `main`:

1. **verify**: `npm ci`, format check, lint, typecheck, unit tests, API tests, the site build (with
   `VITE_API_URL` from the `API_URL` repository variable), the weight budget of the first page
   (`npm run check:bundle`) and the API build.
2. **integration**: the tests of the code that talks to MongoDB (queries, unique indexes, sorting,
   the index that expires sessions, and the cart and order writes that must stay correct when requests
   arrive at the same moment: one cart per account, no lost update, one order per idempotency key) against a real MongoDB 8 that exists only for the job: a
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

## Dependencies and security checks

Separate from the deployment gate, so that a newly published advisory can never stop a deploy:

- **`.github/workflows/security.yml`** runs `npm audit --omit=dev --audit-level=high` (only the
  packages that are shipped; a high or critical advisory fails the job) and CodeQL (JavaScript and
  TypeScript) on pull requests, on pushes to `main` and once a week, which is what finds a problem that
  appears while nothing changes.
- **`.github/dependabot.yml`** opens one pull request a week for the npm packages (minor and patch
  updates grouped, a major update on its own) and one for the GitHub Actions.
- **Actions are pinned to a commit** (`uses: owner/action@<sha> # v4.4.0`), so a moved or hijacked tag
  cannot change what runs; Dependabot moves the pin and the comment together.
- **`.nvmrc`** is the one place for the Node version: `nvm use` and every job of CI read it.
- **No credential-shaped text in the repository** (`scripts/secretShapes.test.mjs`, part of
  `npm test`): a MongoDB Atlas connection string with a password, cloud and token keys and private
  keys are looked for in every tracked file, and the test says which file, never the value. Test data
  that needs a password uses an obviously fake one and a host that cannot exist (`.invalid`), so
  neither this test nor GitHub's secret scanning reports a fixture.
- **`.github/pull_request_template.md`** asks for an English summary, the checks that were run (and
  what was not) and that no secret is in the diff.

Besides `ci.yml`, three workflows run on their own and are not deployment gates: `security.yml`
(above), `lighthouse.yml` (on pull requests and `main`) and `smoke.yml` (every night).

A test that only passes on its retry is reported as **flaky** in the log and the HTML report, so
it is visible rather than hidden. In CI Playwright retries a failed test once and gives assertions
10 s instead of 5 s, because the runners are slower than a developer machine.
