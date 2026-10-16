# 0013. A Content-Security-Policy in every page's tag, security headers where a host can send them, and favorites for each person

**Status:** Accepted (Phase 6 of the QA remediation)

## Context

The session token is kept in `localStorage` ([0002](0002-bearer-tokens-not-cookies.md)), so a script that
ran in a page could read it. The page has nothing like that today (no `innerHTML`, no `eval`, no third-party
script), and a Content-Security-Policy is what keeps it so: it stops code that nobody wrote from running or
sending data away.

GitHub Pages, the primary host, cannot send any response header
([0001](0001-static-site-and-separate-api.md)), and a policy in a `<meta>` tag carries only part of what a
header does. Netlify, the second host, can send headers. What each host sends today (checked on the live
sites) is only `Strict-Transport-Security`.

The favorites were one list for the whole browser and survived signing out, so on a shared browser the
next account to sign in found them.

## Decision

**A policy in the tag of every page.** `scripts/csp.ts` builds it and `vite.config.ts` writes it into the
template (`index.html`), so the home page, the static pages made from it (`scripts/static-routes.mjs`) and
`404.html` all have exactly one:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
connect-src 'self' <API origin>; base-uri 'none'; form-action 'self'
```

- No `'unsafe-inline'`, no `'unsafe-eval'`, no `data:`, no wildcard. The code was checked for what this
  stops: no inline style attribute, no `eval`, no font, no image or script from another site; the one inline
  `<script>` of a page is `application/ld+json`, which is data. The only requests are to the site and the
  API. A violation is a console error, which fails any end-to-end test, so the whole suite runs under the
  policy.
- The API origin is read from `VITE_API_URL`, the variable the build already uses for the app's requests and
  the connection hint (`apiOrigin`), so the policy and the app cannot name different APIs. Only an `http` or
  `https` address is accepted.
- Production builds only: the dev server needs inline code for hot reloading.
- `npm run check:csp` (a CI step after the build) fails unless every HTML file of `dist/` has exactly one
  tag with the policy of that build; `npm run check:site` fails against a deployed site whose pages have none
  or an unsafe one.

**Headers where a host can send them.** `netlify.toml` sends, for every path, the same policy plus
`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer` and a `Permissions-Policy` that turns off camera, microphone, geolocation and
USB. TOML cannot read the build's variables, so the header is written out with the `VITE_API_URL` of the same
file, and `scripts/netlifyHeaders.test.ts` fails if the header is not the policy of the build plus the frame
rule.

**What GitHub Pages cannot do**, and the tag does not do either. A `<meta>` policy ignores `frame-ancestors`,
`report-uri` and `sandbox` (a browser says so in the console), so on Pages:

- the site can be put in a frame by any page (no clickjacking protection), and `X-Frame-Options` cannot be
  sent;
- `X-Content-Type-Options`, `Permissions-Policy` and `Referrer-Policy` cannot be sent (the last can be set
  with another tag, which was not added);
- there is no report-only mode and no violation reports;
- the policy is part of the page, so it protects a page only from the point where the browser has read the
  tag; it comes right after the charset declaration, before any script.

**Favorites for each person.** The guest has a list of their own and so has every account, each under its own
`localStorage` key (the account by a digest of its id). Signing in shows the account's list; signing out or a
session that ends shows the guest list again and leaves the account's where it is. The guest list is never
merged into an account, and nothing is shared the other way. The list that existed before (one for the whole
browser, whose owner cannot be known) is removed once. A list holds at most 100 products (what the API is
asked about at once), a browser keeps the lists of the 10 accounts used last, and the lists stay browser-local.

## Consequences

- A change that needs more than the policy gives (an inline style, a font from a CDN, an analytics script) is
  a change to `scripts/csp.ts` and to `netlify.toml`, with a reason, not a quiet exception; the tests name the
  policy exactly.
- Moving the API to another address means changing `API_URL` for Pages and `VITE_API_URL` in `netlify.toml`
  **and** the header in the same file (a test fails if they differ).
- The policy limits what a script injected into a page can do. It is not a replacement for keeping the page
  free of such code, and a tag does not give what only a header does (see above).
- The favorites of a person are kept out of the application's view of another person. They are not protected
  against code that runs in the page, which can read all of `localStorage`. A person's list stays in the
  browser after they sign out (invisible to the application for anyone else) until it is pushed out by newer
  ones or the visitor clears the browser's data.
- Favorites that existed before the change were not carried over: nobody can say whose they were.
- The password policy is a part of the same phase and is recorded in its own section when it is decided.

## In the code

`scripts/csp.ts`, `vite.config.ts`, `index.html`, `scripts/check-csp.mjs`, `scripts/siteSmoke.mjs`,
`netlify.toml`, `scripts/netlifyHeaders.test.ts`, `e2e/csp.spec.ts`, `src/features/favorites/favoritesStore.ts`,
`src/pages/favoritesIsolation.test.tsx`, `e2e/favorites-isolation.spec.ts`,
[deployment](../deployment.md#security-headers-and-what-github-pages-cannot-do),
[state persistence](../state-persistence.md#the-favorites-of-each-person).
