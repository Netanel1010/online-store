# 0013. A Content-Security-Policy in every page's tag, security headers where a host can send them, favorites for each person, and the rules for a new password

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

A new password had to have a letter and a digit, which turns away `correct horse battery staple` and accepts
`Password1`. Hashing (`server/src/auth/passwords.ts`) was already right and is not touched: scrypt over the
password in Unicode NFKC, which is the same for a fullwidth copy of a text, and which writes a lone surrogate
(half of a pair of UTF-16 units) as U+FFFD, so that different malformed texts, and the real U+FFFD, would be
one password.

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

**The rules for a new password.** Any text of 8 to 128 characters is a password: no rule about letters, digits
or symbols, spaces and any script and emoji allowed, never trimmed or changed. It is refused if (in this order,
by `src/features/auth/passwordPolicy.ts`, which the form and the API both ask, so they cannot disagree):

- it is **too short or too long**, counted in code points both as it was typed and as it is hashed (NFKC), so
  that a decomposed accent (two code points that NFKC makes one) cannot make it too short unseen, one typed
  character that NFKC writes as eighteen cannot make it long enough, and 130 typed characters that NFKC shortens
  to 65 are still over the limit of the input;
- it holds a **lone surrogate**, checked by hand (`passwordIsWellFormed`) because `isWellFormed` is newer than the
  browsers the build supports; it cannot be typed, only sent or pasted;
- it is **one of the most common passwords**: an exact match, after NFKC and lower case, with one of 2086 entries
  (see below). A password that merely contains a common one is accepted;
- it is **the email of the account** (`passwordIsEmail`, in `rules.ts`): equal to the stored email (trimmed, lower
  case) after NFKC and lower case. This needs the email, so it is a second check on the `password` field in the
  form's schema and in the API's. The password itself is not trimmed, so the address with a space around it is
  another password.

Signing in has none of these rules (only 1 to 128 characters), and the hashing and the normalization are as they
were, so every existing account signs in as before; `server/src/auth/passwords.test.ts` holds hashes made before the
change, and `routes.test.ts` signs in accounts whose passwords the new rules would refuse. The API answers
`400 invalid_input` naming `password`, never the reason or the value (the form says why, in Hebrew).

**The list of common passwords** is an adaptation of the "10,000 Most Common Passwords List" of Mark Burnett
(xato.net, 2011), which the author licenses under **CC BY-SA 3.0** with attribution. It was taken through the
SecLists repository (MIT) at one pinned commit, checked by Git blob hash and SHA-256; the copy has the same 10000
lines, in the same order, as the zip the author published (compared against the archived file). Every entry is in
NFKC and lower case, 8 to 128 characters, once, sorted: 2086 are left. Its file,
`src/features/auth/commonPasswords.data.ts`, is therefore under CC BY-SA 3.0 and **not** under this repository's
MIT License (the SecLists licence does not replace the author's), and it says so at the top, in a comment that the
build keeps (`comments.legal` in `vite.config.ts`, checked by `npm run check:notices`), as well as in
[THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and the README. Nothing downloads the list but
`npm run build:common-passwords`, run by hand, which refuses any file that is not the pinned revision. The list is
read by `commonPasswords.ts` only, which only the registration form and the API import, so the sign-in page and
the first page do not carry it (it is in the registration page's chunk).

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
- A password that is not on the list and is not the email is accepted however weak (`qwertyuiopas`, eight spaces).
  The list stops what people try first; it is the 2011 data of one researcher, not a service that knows breached
  passwords, and it is not renewed by itself. Longer and rarer passwords, and a check against a service of
  breached passwords (which needs a request to another site, and a change to the policy above and to what the
  privacy page says), are the ways to go further.
- Renewing the list is a change to the pinned revision, the notices and the script together, after reading the
  history of the source; whoever does it must keep the credit and the licence of the file.
- The build now keeps the notices of the libraries too (about 5 kB before gzip, 0.6 KiB gzipped on the first page),
  because the option that keeps one legal comment keeps all of them.
- The tests of the rules use one table (`src/test/passwordCases.ts`) for the rules, the form, the API and the
  agreement of the form with the API, and were checked by breaking each rule on purpose.

## In the code

`scripts/csp.ts`, `vite.config.ts`, `index.html`, `scripts/check-csp.mjs`, `scripts/siteSmoke.mjs`,
`netlify.toml`, `scripts/netlifyHeaders.test.ts`, `e2e/csp.spec.ts`, `src/features/favorites/favoritesStore.ts`,
`src/pages/favoritesIsolation.test.tsx`, `e2e/favorites-isolation.spec.ts`, `src/features/auth/rules.ts`,
`src/features/auth/passwordPolicy.ts`, `src/features/auth/commonPasswords.ts`,
`src/features/auth/commonPasswords.data.ts`, `src/features/auth/registerSchema.ts`,
`server/src/auth/schemas.ts`, `scripts/build-common-passwords.mjs`, `scripts/check-notices.mjs`,
`e2e/password-policy.spec.ts`, [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md),
[deployment](../deployment.md#security-headers-and-what-github-pages-cannot-do),
[state persistence](../state-persistence.md#the-favorites-of-each-person).
