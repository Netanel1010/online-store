# 0012. Tests run the real API code over in-memory data; MongoDB is tested separately

**Status:** Accepted

## Context

The site depends on an API with accounts, carts and orders. Tests need that API to answer, but
hundreds of tests cannot depend on a database, the network or credentials, and a hand-written mock
would encode the author's idea of the API instead of the API.

## Decision

- **The API's layers are separable:** routes → service → repository, and `createApp` takes its
  database from outside. Every repository has an in-memory twin in `server/src/testing/`.
- **Site tests use the real API code.** `renderApp` answers the pages through `fakeCatalogApi` (the
  real query parser, search, filters, sort, filter options, lookup by id, sale and recommended lists,
  category counts and suggestions), and `setUpAuthApi` serves the real auth, cart and order routes
  over in-memory repositories on a free port, reached by the storefront's own requests.
- **End-to-end tests** run in Chromium against the production build, served like GitHub Pages
  (`/online-store/` and a `404.html` fallback), with a stub API (`e2e/support/api-server.mjs`) that is
  the real API code over in-memory data filled from `public/data/products.json`. Each test gets a fresh
  browser context and registers its own throwaway account.
- **What a fake cannot prove goes to a real MongoDB:** unique indexes, atomic cart updates, idempotent
  orders under concurrency, the TTL index, the query planner, and equality of the in-memory and MongoDB
  answers. `npm run test:server` skips these; `npm run test:integration` runs them, **refuses to start
  without `MONGODB_TEST_URI`** (so it cannot pass by skipping) and refuses an Atlas address unless
  `MONGODB_TEST_ALLOW_ATLAS=1`. They use databases named `online_store_test_<random>` and drop them.
- **CI provides the database as a GitHub Actions service container** (`mongo:8.0`), so Docker is not a
  dependency of the project, and the job has no secret and no production address.

## Consequences

- The filtering rules are written once and tested through the pages that use them.
- The fast suites need no MongoDB and no credentials; the integration suite needs a MongoDB of the
  developer's own to run locally.
- The browser tests fail on any uncaught error, console error, failed request or failing asset; the
  one excuse is a request the page cancelled on purpose.
- Automated accessibility checks (axe-core) find only part of the problems and do not establish WCAG
  conformance.

## In the code

`server/src/testing/`, `src/test/` (`fakeListingApi.ts`, `authApi.ts`), `e2e/support/`,
`server/vitest.integration.config.ts`, `.github/workflows/ci.yml`, `docs/testing.md`.
