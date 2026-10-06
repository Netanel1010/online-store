# Production roadmap M1–M8: progress

Work on the branch `chore/production-roadmap-m1-m8`, one commit per milestone, in order. The commit
of each milestone is in `git log`; the final report ([production-roadmap-m1-m8-report.md](production-roadmap-m1-m8-report.md))
lists every SHA.

| M   | Status | Summary                                                                                                                                                                                                             |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | DONE   | The e2e safety net excuses a request only when the page itself cancelled that address (`ERR_ABORTED`); every other failure still fails the test.                                                                    |
| M2  | DONE   | Per-address limits on sign-in (30 per 15 min) and registration (10 per hour), a concurrency gate on password hashing (2 at once, 8 waiting, then 503), and `TRUST_PROXY_HOPS` for the client address behind Render. |

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
