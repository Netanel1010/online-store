# 0002. Sessions travel in an `Authorization` header, not in cookies

**Status:** Accepted

## Context

The site (`github.io`) and the API (`onrender.com`) are different _sites_. A session cookie set by the
API would be a third-party cookie, which Safari and a growing number of browser settings block, so
sign-in would silently fail for those visitors.

## Decision

The API returns a session token at registration and sign-in, and the site sends it as
`Authorization: Bearer <token>` on every request that needs an account. The token is kept in
`localStorage` (`online-store:session`). CORS is configured without credentials, and `Authorization`
is an allowed header.

## Consequences

- It works the same in every browser, and no cookie, `SameSite` or third-party-cookie setting needs
  configuring.
- No CSRF protection is needed: a request from another site cannot add the header, and a request that
  carries it is first checked by the browser with a preflight, which the same allow-list answers.
- The price: a script that runs in the page (an XSS bug) could read the token. The answers to that are
  the short life of a session (7 days), its revocation on sign-out and with "sign out everywhere", and
  a storefront that renders all text as text, never as HTML.

## In the code

`server/src/auth/middleware.ts`, `server/src/auth/tokens.ts` (`readBearerToken`),
`server/src/app.ts` (CORS), `src/features/auth/authStore.ts`, `server/README.md#authentication`.
