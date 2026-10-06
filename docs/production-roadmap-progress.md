# Production roadmap M1–M8: progress

Work on the branch `chore/production-roadmap-m1-m8`, one commit per milestone, in order. The commit
of each milestone is in `git log`; the final report ([production-roadmap-m1-m8-report.md](production-roadmap-m1-m8-report.md))
lists every SHA.

| M   | Status  | Summary                                                                                                                                                                                                                         |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | DONE    | The e2e safety net excuses a request only when the page itself cancelled that address (`ERR_ABORTED`); every other failure still fails the test.                                                                                |
| M2  | DONE    | Per-address limits on sign-in (30 per 15 min) and registration (10 per hour), a concurrency gate on password hashing (2 at once, 8 waiting, then 503), and `TRUST_PROXY_HOPS` for the client address behind Render.             |
| M3  | DONE    | Security headers (with HSTS only over HTTPS), explicit CORS methods/headers/`Retry-After`/max-age, `no-store` on errors, a 25 s answer timeout, proxy-friendly server timeouts and warn-by-default production hardening checks. |
| M4  | DONE    | Request ids (`X-Request-Id`, `requestId` in 5xx bodies), one structured JSON log line per request and for errors, with secrets scrubbed, and a Render troubleshooting guide.                                                    |
| M5  | PARTIAL | A CI `integration` job runs the MongoDB tests against a throwaway MongoDB 8 service container, `npm run test:integration` cannot skip, and deploy needs the job. Verified locally; the job itself has not run on GitHub yet.    |
| M6  | DONE    | React error boundaries (root and per page, with a stale-deployment case that offers a reload), verified together with the earlier timeout, retry, cold-start message, preconnect and removed preload.                           |
| M7  | DONE    | Dependabot, a security workflow (npm audit of shipped packages and CodeQL), every action pinned to a commit, `.nvmrc` as the single Node version, a PR template, and fake-looking fixtures guarded by a repository scan.        |

## M1: E2E reliability

- **Cause:** `e2e/support/test.ts` failed a test on any `requestfailed`, including the
  `net::ERR_ABORTED` of a request the storefront cancels on purpose (`useProductListing` aborts the
  previous listing request when a filter changes). Whether that report arrived before the test ended
  depended on timing: `filter-sort.spec.ts` failed 2 of 5 runs on clean `main`.
- **Fix:** `e2e/support/requestFailures.ts`. A wrapper around `fetch` reports every request whose
  `AbortSignal` the page aborts. A failure is excused only if it is `ERR_ABORTED`, it is a fetch/XHR,
  and the page cancelled that exact address (one cancellation excuses one failure). The decision is
  made when the test ends, so the order of the two reports does not matter. The application is
  unchanged.
- **Tests:** `e2e/safety-net.spec.ts` (7): a plain abort and a derived-signal abort are excused; an
  abort the page did not cause, a connection failure (even if the page cancelled it later), a
  failure of another address, a second failure of the same address and an aborted image still fail.
  The formerly flaky spec passed 270 of 270 runs (15 repeats); the full suite passed (271).
- **Known issues:** none.

## M2: Authentication abuse protection

- **Per-address limits** (`middleware/rateLimit.ts`, numbers in `auth/routes.ts`): 30 sign-in attempts
  per 15 minutes and 10 registrations per hour per client; `429 rate_limited` with `Retry-After`,
  and a refused request never reaches the account or the hash. IPv6 is counted per /64
  (`lib/clientKey.ts`). `/me` and `/logout` are not limited.
- **Hashing in bulk** (`lib/concurrencyGate.ts`, used by `auth/service.ts`): two hashes at once,
  eight waiting, the rest `503 server_busy` with `Retry-After`.
- **Render proxy:** `TRUST_PROXY_HOPS` (default 2 in production, 0 elsewhere) sets Express's
  `trust proxy`; the address is read from the right of `X-Forwarded-For`, so a visitor cannot choose it.
- **In memory:** the limits restart with the process, are per instance, and only slow a determined
  attacker. Documented in `server/README.md` and `docs/deployment.md`.
- **Tests:** 11 for the limiter, 6 for the gate, 6 for the client key, 13 over HTTP (limit, headers,
  error shape, no hashing for a refused request, successful sign-ins counted, separate limits,
  trusted proxy and spoofing, 503 under load and recovery), 8 for the config. The e2e stub and the
  frontend test helper switch the limits off and give the gate room (hundreds of tests register
  from one address). Server 616, frontend 624, e2e 271, builds and lint pass.
- **Known issues:** the right number of proxies on Render cannot be proven from here: verify after
  the first deployment (`docs/deployment.md#client-addresses-and-rate-limits`; it uses the request
  log of M4). A `503 server_busy` is shown by the storefront as "could not reach the server".

## M3: HTTP security hardening

- **Headers** (`middleware/securityHeaders.ts`, no framework): nosniff, `Referrer-Policy: no-referrer`,
  a CSP that allows nothing and no frames, `X-Frame-Options`, HSTS only when `req.secure` (so a local
  server never pins `localhost`, and a header sent by a visitor cannot trigger it when no proxy is
  trusted). Every error answer is `Cache-Control: no-store` (`errorHandler`).
- **CORS:** methods `GET,HEAD,POST`, allowed headers `Authorization,Content-Type`, exposed
  `Retry-After`, preflight max-age 600 s (from the earlier performance milestone). Product read
  caching (`max-age=60, stale-while-revalidate=3600`) was already in place and is checked.
- **Timeouts:** `middleware/requestTimeout.ts` answers `503 request_timeout` after 25 s;
  `lib/serverTimeouts.ts` sets keep-alive 65 s / headers 66 s / request 120 s (the proxy keep-alive race).
- **Production checks:** `scripts/apiHardening.mjs` (13 tests) used by `scripts/check-api.mjs`.
  Warnings by default, errors with `STRICT_HARDENING=1`: the deploy job checks the API deployed
  _before_ the change, so strict checks would block the deploy that ships it. Run against the real
  production API now it warns about exactly the gaps this milestone closes.
- **Tests:** 15 for headers/CORS/no-store (`app.security.test.ts`), 3 request timeout, 3 server
  timeouts, 13 hardening checks. Server 637 (52 integration skipped locally), frontend 637 (incl. the 13 script tests), e2e 271 pass.
- **Known issues:** HSTS and the header set can only be verified in production after Render deploys
  (`STRICT_HARDENING=1 npm run check:api`). No CSP on the GitHub Pages site (it cannot send headers).

## M4: Observability

- **Request ids** (`middleware/requestLogging.ts`): every answer has `X-Request-Id` (a valid caller id,
  8 to 64 of `A-Za-z0-9._-`, is kept; anything else is replaced by a UUID, so an id cannot forge a
  log line). A 5xx body has `error.requestId` (additive; the 500 test now checks that it equals the
  header and the id on the `error` log line). Exposed to the site through CORS.
- **Structured logs** (`lib/logger.ts`, no library): one JSON line per request (method, path
  without query, status, `durationMs`, client `ip`, `aborted`), one `error` line with name, message,
  stack and cause, and JSON startup/shutdown lines. Successful `/api/health` checks are skipped.
- **Secrets:** `redactSecrets` (connection string credentials, `Bearer …`) on every text and
  `scrub` (field names like password, token, authorization, cookie, secret, uri) on every field.
  Tests send a password, bearer tokens, a cookie, a search query and a database error that repeats a
  connection string, and assert none of it appears in any log line.
- **Docs:** `docs/deployment.md#troubleshooting-with-the-logs` (what a line looks like, how to find
  a visitor's error by request id, slow requests, refusals, checking the client address),
  `server/README.md`. `check:api` also checks for `X-Request-Id` (warn mode).
- **Tests:** 15 logger, 18 request logging/ids (incl. a stubbed response for abandoned requests).
  A real compiled-server run printed the expected lines. Server 669 (52 integration skipped locally), frontend 638, e2e 271 pass.
- **Known issues:** logs are only as retained as Render keeps them (free tier: short). No metrics or
  alerting. The storefront does not show the `requestId` to the visitor yet.

## M5: MongoDB integration tests in CI

- **`npm run test:integration`** (`server/vitest.integration.config.ts`): runs only
  `*.integration.test.ts`; **throws at startup without `MONGODB_TEST_URI`** (so it can never pass by
  skipping), and refuses an Atlas address unless `MONGODB_TEST_ALLOW_ATLAS=1`. `npm run test:server`
  is unchanged and still skips them, so unit tests stay fast.
- **CI** (`.github/workflows/ci.yml`): job `integration` with a `mongo:8.0` service container
  (health-checked with `mongosh`), `MONGODB_TEST_URI=mongodb://localhost:27017`, `npm ci`,
  `npm run test:integration`. `deploy` now needs `[verify, e2e, integration]`, so Render's
  `checksPass` and the Pages deploy both wait for it. Docker exists only inside GitHub Actions.
- **Isolation and safety:** the tests use databases named `online_store_test_<random>` and drop them;
  the job has no secrets and no production address; the container is destroyed with the job.
- **Verified:** both guards (no URI, Atlas URI) trigger; the 3 suites (52 tests) pass against a real
  MongoDB (a temporary Atlas database through `server/.env`, URI never printed) and left no
  database behind; the workflow YAML parses and the job graph is as intended.
- **Known issues (why PARTIAL):** the new job has not run on GitHub Actions: there is no runner or
  Docker here. The first pull request will show whether the `mongosh` health check and the
  `localhost:27017` mapping work as expected; if the service fails to become healthy, that is where
  to look.

## M6: Frontend resilience

- **Already delivered** (merged earlier in `perf: improve initial load and responsive ux`, verified
  here and not redone): API timeout (30 s per attempt) and retry (3 attempts) in
  `lib/fetchWithRetry.ts`, the cold-start message (`SlowLoadNotice`), the removal of the stale
  `products.json` preload and the API `preconnect`/catalog `preload` (`vite.config.ts`). No
  `products.json` reference is left in `index.html`.
- **Error boundaries** (new): `components/shared/ErrorBoundary.tsx` (class, resets when its
  `resetKey` changes), `CrashScreens.tsx`, `lib/chunkError.ts`. A boundary in `RootLayout` around the
  page (header and footer stay; going to another page clears it) and one around the router in
  `App` (last resort, no router needed). A page that fails to load after a new deployment
  (`Failed to fetch dynamically imported module` and the Firefox/Safari wordings) says a new
  version is available and offers a reload, because a retry cannot work (React remembers the failed
  import); any other render error offers "try again" and a link home and says the cart is safe.
  The error is written to the console; the technical message is not shown to the visitor.
- **Tests:** 40 unit/component tests (classification, boundary mechanics, both screens, the real
  layout keeping header/footer, recovery by navigating or retrying, the whole-app case) and an e2e
  spec that refuses a lazy chunk for real; it fails (blank page) without the boundary. Frontend 678,
  e2e 273 pass.
- **Known issues:** errors in event handlers and un-awaited promises are not render errors and are
  not caught by a boundary (their code handles them). No remote error reporting (`onError` is the
  hook for it).

## M7: Dependency and security hygiene

- **Dependabot** (`.github/dependabot.yml`): weekly, one grouped pull request for npm minor/patch
  updates (majors separate) and one for Actions; limits of 5 and 3 open pull requests.
- **`security.yml`**: `npm audit --omit=dev --audit-level=high` (0 vulnerabilities today, so it does not
  start red) and CodeQL `javascript-typescript` (`build-mode: none`), on pull requests, pushes to main
  and weekly. Not a deployment gate on purpose.
- **Pinning:** all 11 `uses:` in `ci.yml` (and the ones in `security.yml`) are pinned to the commit
  their major tag pointed to when this was written (looked up through the public GitHub API:
  checkout v4.4.0, setup-node v4.4.0, upload-pages-artifact v3.0.1, deploy-pages v4.0.5,
  upload-artifact v4.6.2, codeql-action v3.38.2), so the behaviour is unchanged; the release is in a
  comment. `node-version: 24` became `node-version-file: .nvmrc` (`24`).
- **Fixtures:** the two Atlas-shaped test strings (`.mongodb.net` hosts, one of them the one GitHub
  once reported) now use `test-user:not-a-real-password@cluster.example.invalid`.
  `scripts/secretShapes.mjs` + test (24 tests with the existing script tests) fail if any tracked
  file holds an Atlas connection string with credentials, an AWS/GitHub/Slack/Stripe key or a
  private key; samples are assembled at run time and findings never print the value.
- **PR template** in English.
- **Not added (noisy or redundant):** no separate secret-scanning tool (GitHub's push protection and
  the repository test cover it), no licence scanner, no audit of dev dependencies in CI.
- **Known issues:** neither new workflow has run on GitHub yet (both parse and the audit command was
  run locally). CodeQL needs the repository to be public or to have code scanning enabled. The
  Dependabot ecosystem for the `server` workspace relies on the root lockfile.
