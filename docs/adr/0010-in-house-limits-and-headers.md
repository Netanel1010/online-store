# 0010. Rate limits and security headers are written in-house, without extra libraries

**Status:** Accepted (M2, M3, M9)

## Context

The API runs as one small process on a free host. What needs protecting is cheap to name: the cost of
hashing passwords, a flood of writes, and the headers of a server that answers only JSON.

## Decision

- **Limits per client address** (`middleware/rateLimit.ts`, a fixed window in a `Map` with a cap on
  the clients remembered): sign-in 30 per 15 minutes, registration 10 per hour, placing an order 20
  per hour, changing a cart 300 per 15 minutes. Past the limit: `429 rate_limited` with `Retry-After`,
  and the request never reaches the account, the hash or the database. They are checked before the
  session is looked up. An IPv6 address counts as its /64.
- **Other defences against hashing in bulk:** five failed sign-ins per email block that email for 15
  minutes (whether or not the account exists), and a gate runs two hashes at once with eight waiting
  and answers the rest `503 server_busy`.
- **Which address is counted** is set by `TRUST_PROXY_HOPS` (2 in production: Cloudflare, then
  Render's load balancer; 0 elsewhere), read from the right of `X-Forwarded-For` so a visitor cannot
  choose it.
- **Headers** (`middleware/securityHeaders.ts`) are set by a few lines of code, not by Helmet:
  `nosniff`, `Referrer-Policy: no-referrer`, a CSP that allows nothing, `X-Frame-Options: DENY`, and
  HSTS only when the request really came over HTTPS. Every error answer is `no-store`.
- No rate-limit or security-header dependency was added.

## Consequences

- **All limits are in the memory of the process.** They restart with it (a free service restarts when
  it wakes), each instance of a scaled-out API would count on its own, and a determined attacker with
  many addresses is slowed, not stopped. A shared store such as Redis is the next step if the API ever
  runs on several instances; it is not needed now.
- The right number of proxies cannot be proven from outside Render; it is checked once after a
  deployment ([runbook](../runbook.md#check-that-the-client-address-is-right)).
- CodeQL may report a missing rate limit on a route that the in-house limiter covers, because it does
  not recognize it. Dismiss such an alert with that reason rather than adding a dependency.
- A shared address (a school, an office) shares a limit, which is why the registration limit is not
  smaller.

## In the code

`server/src/middleware/` (`rateLimit.ts`, `securityHeaders.ts`), `server/src/lib/` (`clientKey.ts`,
`concurrencyGate.ts`), `server/src/auth/throttle.ts`, `scripts/apiHardening.mjs`,
`docs/production-roadmap-progress.md` (M2, M3), `docs/m9-server-cart-and-orders.md`.
