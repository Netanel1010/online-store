# Production roadmap M1–M8: progress

Work on the branch `chore/production-roadmap-m1-m8`, one commit per milestone, in order. The commit
of each milestone is in `git log`; the final report ([production-roadmap-m1-m8-report.md](production-roadmap-m1-m8-report.md))
lists every SHA.

| M   | Status | Summary                                                                                                                                                                                                                         |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | DONE   | The e2e safety net excuses a request only when the page itself cancelled that address (`ERR_ABORTED`); every other failure still fails the test.                                                                                |
| M2  | DONE   | Per-address limits on sign-in (30 per 15 min) and registration (10 per hour), a concurrency gate on password hashing (2 at once, 8 waiting, then 503), and `TRUST_PROXY_HOPS` for the client address behind Render.             |
| M3  | DONE   | Security headers (with HSTS only over HTTPS), explicit CORS methods/headers/`Retry-After`/max-age, `no-store` on errors, a 25 s answer timeout, proxy-friendly server timeouts and warn-by-default production hardening checks. |
| M4  | DONE   | Request ids (`X-Request-Id`, `requestId` in 5xx bodies), one structured JSON log line per request and for errors, with secrets scrubbed, and a Render troubleshooting guide.                                                    |

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
