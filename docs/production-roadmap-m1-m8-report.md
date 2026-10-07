# Production roadmap M1–M8: final report

Branch `chore/production-roadmap-m1-m8`, started from `origin/main` at `982bf0a` (the merge of the
responsive-UX pull request). One commit per milestone, in order, then this report. The details of each
milestone are in [production-roadmap-progress.md](production-roadmap-progress.md). Nothing was pushed,
no pull request was opened, M9 (server cart, orders, order history) and later were not started.

## 1. Status

| M   | Status      | Commit                                     | Message                                          |
| --- | ----------- | ------------------------------------------ | ------------------------------------------------ |
| M1  | DONE        | `5afd817405674ff42e190c7c6f2d07f95a783cbb` | `test: fix expected e2e request abort handling`  |
| M2  | DONE        | `6bf3f3509c1e0137cfd48e51c1d026c3c54dd004` | `feat: add authentication abuse protection`      |
| M3  | DONE        | `dfb06e59da3f952edb2abb7ffe2c7224224c5147` | `chore: harden api http security`                |
| M4  | DONE        | `8663110dc058fe43dca4e73ab1d62c56df1f4e4d` | `feat: add request ids and structured logging`   |
| M5  | **PARTIAL** | `eb762d363921f13d02bb5df785db880fa3e51bc1` | `ci: run mongodb integration tests`              |
| M6  | DONE        | `1c0e2f79259b69cbf42b6be38084a01d50106b8c` | `feat: improve frontend resilience`              |
| M7  | DONE        | `9550c7885111e66f0199c533c932df1378e5a13b` | `chore: improve dependency and security hygiene` |
| M8  | DONE        | `1d225c535e3c0ccc6f52e2723a4a1f697ab4407b` | `feat: harden authentication sessions`           |

M5 is PARTIAL because the new CI job has not run on GitHub Actions (there is no runner or Docker
here); everything it runs was verified locally against a real MongoDB. M7's two new workflows are in
the same position (they parse, and the audit command was run locally).

Every commit carries both co-author trailers.

## 2. What each milestone delivered

- **M1.** The e2e safety net no longer treats a request the page cancelled on purpose as a failure. The
  page reports each `fetch` whose `AbortSignal` it aborts, and only an `ERR_ABORTED` fetch for an
  address the page itself cancelled is excused (one cancellation excuses one failure); anything else,
  including an abort the page did not cause, still fails. The formerly flaky spec went from failing 2
  of 5 runs to passing 270 of 270 (15 repeats).
- **M2.** Per-address limits on sign-in (30 / 15 min) and registration (10 / hour), IPv6 counted per
  /64; a concurrency gate on password hashing (2 at once, 8 waiting, then `503 server_busy`);
  `TRUST_PROXY_HOPS` (default 2 in production) so the client address behind Cloudflare and Render's
  load balancer is read from the right of `X-Forwarded-For` and cannot be chosen by the visitor.
  In-memory limitations are documented.
- **M3.** Security headers (nosniff, `Referrer-Policy`, a CSP that allows nothing, `X-Frame-Options`, HSTS
  only over HTTPS), `no-store` on every error, explicit CORS methods/headers/exposed headers, a 25 s
  answer timeout, keep-alive timeouts that remove the proxy `502` race, and `check:api` hardening checks
  (warnings by default, errors with `STRICT_HARDENING=1`, so the deploy that ships the headers is not
  blocked by their absence). Product read caching and the preflight max-age were already in `main`.
- **M4.** Request ids (`X-Request-Id`, kept if valid; `requestId` in 5xx bodies), one structured JSON
  line per request and per error, scrubbing of passwords, tokens, headers and connection strings, no
  query strings in logs, and a Render troubleshooting guide.
- **M5.** `npm run test:integration` (refuses to start without `MONGODB_TEST_URI`, refuses Atlas unless
  allowed on purpose), and a CI job with a throwaway `mongo:8.0` service container that the deploy
  now waits for.
- **M6.** Error boundaries around the page and around the whole app, with a "new version available,
  reload" case for a lazy page that fails to load after a deployment. The timeout, retry, cold-start
  message, preconnect and removal of the `products.json` preload were already merged earlier and were
  verified, not redone.
- **M7.** Dependabot, a `security.yml` (npm audit of shipped packages, CodeQL), all actions pinned to a
  commit, `.nvmrc`, an English PR template, fixtures that no scanner reports, and a repository test
  that fails on secret-shaped text.
- **M8.** A `userId_createdAt` index on `sessions`, a cap of 10 sessions per account (the oldest ends),
  `POST /api/auth/logout-all` with a storefront entry, and tested behaviour for ended, expired and
  orphaned sessions.

## 3. Tests and checks (final state of the branch)

| Check                                          | Result                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier on every changed file                 | pass                                                                                                                                          |
| ESLint, `tsc -b`                               | pass, no warnings                                                                                                                             |
| Frontend and script tests (`npm test`)         | **696 passed**, 54 files                                                                                                                      |
| API tests (`npm run test:server`)              | **699 passed**, 58 skipped (the integration tests, as designed)                                                                               |
| MongoDB integration tests (`test:integration`) | **58 passed**, 3 files, against a real MongoDB (a temporary Atlas database through `server/.env`, URI never printed); no database left behind |
| End-to-end (`npm run test:e2e`)                | **280 passed**                                                                                                                                |
| Production builds (site and API)               | pass                                                                                                                                          |
| `npm audit --omit=dev --audit-level=high`      | 0 vulnerabilities                                                                                                                             |
| Compiled server, real run                      | prints the expected JSON log lines; startup tests pass                                                                                        |
| `check:api` against the real production API    | passes; reports the 8 hardening gaps as warnings (the API is the version before this branch)                                                  |

The numbers at the start of the work (previous milestone) were 638 frontend, 572 API, 235 e2e.

## 4. Blockers and what could not be verified here

- **The new CI jobs have not run on GitHub** (`integration` in `ci.yml`, `audit` and `codeql` in
  `security.yml`). The workflows parse, the dependency graph is right, the actions are pinned to the
  commits their tags pointed to, and the commands they run pass locally. The first pull request is
  their first real run. If `integration` fails to start, look at the `mongosh` health check of the
  service container and at port 27017. CodeQL needs code scanning to be available for the repository.
- **Settings that depend on Render and Cloudflare cannot be proven from here:** the right
  `TRUST_PROXY_HOPS` (default 2), and HSTS (it is only sent over HTTPS, and only after the new API is
  deployed). Procedures are in `docs/deployment.md`.
- **No blocker stopped a milestone.** No milestone was skipped.

## 5. Remaining issues

- The storefront does not show the `requestId` of a server error to the visitor yet; it is in the API's
  answer and its logs.
- A `503 server_busy` or `429 rate_limited` is shown by the storefront as a generic "could not reach"
  or "too many attempts" message, not a specific one.
- All the limits (sign-in, registration, hashing) are in the memory of one process: they restart when
  the free service sleeps, are per instance, and only slow a determined attacker.
- There is no account page: "sign out everywhere" is in the menu and in the header from 1280 px.
- No password change, reset or email verification (not part of this roadmap).
- Logs are only as retained as Render keeps them; there are no metrics or alerts.
- The cart and favorites are still per browser, and checkout is still a client-side demo (M9).
- GitHub Pages cannot send headers, so the site has no Content-Security-Policy.

## 6. Exact next step

1. **Review and merge** this branch through a pull request (title and description in English). Its
   checks are the first real run of the `integration`, `audit` and `codeql` jobs; fix them if they
   report something.
2. **After Render has deployed the new API**, run `STRICT_HARDENING=1 npm run check:api` (see
   `docs/deployment.md`), and check `TRUST_PROXY_HOPS` as described in "Client addresses and rate
   limits": the `ip` in the log line of your own request must be your public address.
3. **If the site is deployed before the API**, "sign out everywhere" says it could not be done until the
   API has the new endpoint; nothing else depends on the order.
4. **Then decide M9** (server cart and orders): keep checkout a demo, or make it real. M9 was not started.
