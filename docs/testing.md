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

The name of an account is read like the delivery details (a character that is not text is refused as it
was typed, before any trimming, and only then is the name tidied), and the form and the API read it with
one field (`requiredText` in `src/lib/validation.ts`). The characters and names are listed once, in
`src/test/nameCases.ts`, and used by `server/src/auth/schemas.test.ts` (the API),
`src/features/auth/schemas.test.ts` (the form), `src/features/auth/nameAgreement.test.ts` (the same names
through the form, the API and the checkout's name rules), `server/src/auth/routes.test.ts` (HTTP: the
error names the field and repeats nothing, and nothing is created) and `src/pages/auth.test.tsx` (a pasted
name in the real form). The same files pin what the email accepts, as it always did: spaces and
whitespace characters around an address are dropped, anything else that is not text is refused, and
an address with a trailing line break registers as the clean address and signs in either way.

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

### The delivery details

The form and the API read the delivery details with one schema (`src/features/checkout/delivery.ts`,
with `src/lib/textRules.ts` and the phone number in `src/lib/validation.ts`), and both store what it
produces: the invisible marks of a copy from a right-to-left page dropped, spaces tidied, the text
composed (NFC), a phone number written locally (`0501234567`), Arabic-Indic digits as 0-9. The rules are
about the shape of a value; no test or message claims that an address exists or can be delivered to.

A value is read in one order: it is first **looked at as it was typed** and refused if it holds anything
that is not text (a tab, a line break, any other control character, a line or paragraph separator, a
character that reorders text), and only then is it normalized. Normalizing removes spaces, the
invisible marks, the blank lines around a note and the separators a field names for itself (a phone
number: spaces, dashes, dots, brackets; a postal code: spaces and dashes), and nothing else. It never
uses `trim()` or `\s`, which would remove a tab or a line break before anyone looked for it.

- `src/features/checkout/deliveryControlCharacters.test.ts`: every field with each control character
  (tab, line feed, carriage return, vertical tab, form feed, next line, line and paragraph separator,
  NUL, escape, delete, a C1 control) in the middle of the value, at its start and at its end, which must
  be refused and not tidied away (the notes take line breaks, so only those are different there); and
  that the separators a number is normalized with are the only ones removed.
- `src/lib/textRules.test.ts` and `src/lib/validation.test.ts`: the helpers (that no normalizer removes
  a tab or a line break, and that the check does not find the marks that normalizing drops), every
  override and isolate, the joiners that Persian and emoji need, that reading a value twice changes
  nothing, and the phone number in each way of writing it, against the numbering plan, and with a control
  character among the digits.
- `src/features/checkout/delivery.test.ts` and `deliveryAddress.test.ts`: each field, at its limit and
  one past it, with real Israeli cities, streets and names (`פ"ת`, `ז'בוטינסקי`, `בן־גוריון`, Arabic and
  Latin) and with what must be refused (direction characters, tags, a formula at the start, `0` as a
  house number, `0000000` as a postal code).
- `src/features/checkout/openapiContract.test.ts`: `docs/openapi.yaml` against the schema. The request
  schema (`DeliveryDetailsRequest`) states, per field, the longest value that is read as it was typed
  (`maxLength`: 500, except the phone number 30, the postal code 20 and the notes 2,000) and, under
  `x-normalized`, the limits and patterns of the normalized value; the test checks each number and each
  pattern against the schema at its limit and one past it, that nothing else restricts the value as typed,
  that the example is read as the stored example says, and that the stored schema (`DeliveryDetails`) has
  no limit, because an order placed before these rules keeps the form it had. The limits live in
  `DELIVERY_LIMITS`, which the schema uses too.
- `server/src/orders/schemas.test.ts` and `routes.test.ts`: the API stores the tidied details, a retry
  typed another way is the same request and not a `409`, and each unsafe value, a control character at
  either end of a field or inside a number among them, is a `400 invalid_input` that names only the
  field and stores nothing.
- `src/pages/checkout.test.tsx` ("the rules for the delivery details") and `e2e/orders.spec.ts`: a
  number pasted with direction marks, a tab inside a phone number and a postal code, the messages, a note
  of 300 simple emoji that is not cut short by the field, and that nothing is sent while a field is
  refused. Every limit counts Unicode code points (`characterCount`): a flag, a family emoji or a letter
  with niqqud counts as several, which `textRules.test.ts` and the notes tests pin.

### An order whose answer was lost

The rule is that an unresolved attempt keeps one `Idempotency-Key`, and the API decides
([ADR 0005](adr/0005-orders-priced-and-deduplicated-by-the-api.md)). It is tested where it can break:

- `server/src/orders/service.test.ts`, `routes.test.ts` and `schemas.test.ts`: the `409` names the
  account's own order and nothing else, an edited request under a key no order has used is placed,
  the first request and an edited one at the same moment make one order, `POST /api/orders/lookup`
  (found, `order_not_found`, another account's key, an invalid body, no GET variant, and that the key
  is in no log line).
- `server/src/orders/orders.integration.test.ts`: the same race on a real MongoDB, and the lookup
  through the whole API.
- `src/features/orders/checkoutAttempt.test.ts`, `submitOrder.test.ts` and `orderService.test.ts`: the
  key is kept across edits of the details and of the cart, is kept separately for each account (another
  account ordering in between does not take it away), is forgotten only when an order exists, and stays
  when storage cannot be written (even while an older copy can still be read); a double submit sends one request, and only within one session; and
  `lookupOrder` treats only an explicit `404 order_not_found` as "no order" (every other answer, such
  as a route-level `404 not_found`, an empty body or HTML, is "cannot verify").
- `src/pages/checkout.test.tsx`: the page, with a first answer that is lost after the API made the
  order (`watchOrderRequests('lose-first-answer')`). An edited retry makes no second order, keeps the
  edit in the form and shows the order that exists; a reload finds the order before anything is sent;
  a separate order needs the confirmation; an older API that cannot say keeps the key, places nothing
  and points to "My orders"; Enter twice and a double click send one request; a page left while the
  order is on its way does not move the visitor; another account that orders in between leaves the
  first account's attempt to be found when it comes back; an answer that arrives after the visitor
  switched accounts (the order came back late, or its answer was lost) touches neither the new
  account's cart, page nor session, and keeps the first account's key, so that account finds its order
  when it comes back and cannot order the same cart again; the page starts afresh for each account;
  and a later, confirmed order gets a key of its own.
  `holdOrderRequests` keeps a request on its way until a test lets it go; release it in a `finally`,
  because a request that never ends would be joined by the next test's order.
- `e2e/orders.spec.ts`: the same flow in a real browser, where the answer the page gets back is not the
  order. The suite fails any request that fails, so a dropped connection cannot be used to simulate it.

In the browser, `e2e/cart-sync.spec.ts` checks that signing out empties this browser and signing in
brings the cart back, that a browser that has never seen the cart reads it from the API, that a cart
filled in while signed out joins the account's at sign-in, and that a change on the cart page is
saved. `e2e/cart-tabs.spec.ts` uses two tabs of one browser context, which share one `localStorage` and
receive the browser's own `storage` events, so nothing is simulated: a product added in each tab is in
both, in storage, on the API and in a new tab; the same product added in both is counted twice; the cart
page follows the other tab and says so; and on the checkout the second tab cannot place an order again
after the first one placed it, also when it never hears the event (a tab that is given no `storage`
listener) and a changed cart is shown by the click and ordered by the next one. The unit tests play the
other tab with a written value and a dispatched event, and the one case they cannot play is pinned
instead: two writes in the same instant overwrite one another (`cartStore.test.ts`). The E2E tests also place orders and read the order history through the same stub API
(`e2e/auth-checkout.spec.ts`, `e2e/orders.spec.ts`).

### A session that ends on the checkout

The rules are in [state-persistence.md](state-persistence.md#a-session-that-ends-on-the-checkout). Where
they are tested:

- `src/features/orders/checkoutDraft.test.ts`: what is kept (the nine fields and nothing a form also
  holds: a tick, a token, a key, a card number and a password are given to the function on purpose and
  must not come out the other side), the age to the millisecond and a clock that went back, another
  account, every spoilt shape (not JSON, a field more or less, a number for a field, another version) and
  every value the rules of an order refuse (a tab, a line break, a direction override, a formula, an email
  with a trailing line break, notes over the limit), a storage that throws, nothing told to the console,
  and the guard that follows who is signed in. The cleaning of old drafts out of storage is tested with
  fake timers and a set clock, never with a real wait: an old draft or a spoilt one removed as the site
  opens with nobody signed in, a good one kept with one timer, the timer firing at the end and not a
  moment before, a timer that fires early removing nothing and setting itself again, a newer draft
  not removed by the timer of the one it replaced, the page shown again after a suspension (the clock
  moved, the timer never ran), a hidden page leaving it alone, no timer without a draft, stopping once or
  twice, and an old draft that is still in storage being refused by every read.
- `src/features/auth/sessionEnded.test.ts`: the mark that a session ended lasts ten seconds and no
  longer, and only the one reason is read from a redirect state.
- `src/pages/checkoutSessionRecovery.test.tsx`: the whole flow through the real app and API code (an
  order after every session ended, the login page and its message, the sign-in, the checkout with the
  details, the cart and an unticked demo box, no order without the tick, one key across the refused and
  the placed request, one order); that the draft is made before the sign-out, that only delivery fields
  are stored (and nothing in `localStorage`), and that no other answer makes a draft; sign-out by choice
  (account menu, on the checkout itself, of every device); another account (at the moment it signs in, and
  when the first comes back); drafts that cannot be used (old, not JSON, a field too many, a value the
  rules refuse, another account's, an old one that nothing had removed yet); old drafts taken out of
  storage as the site opens on the login page and when the tab is shown again; use once (a reload, the cart and back, the Back button, an empty
  cart); and an edit to a value the rules refuse, which is not sent.
- `src/pages/checkout.test.tsx`: an answer of 401 that reaches a page whose account has changed keeps no
  draft and signs nobody out.
- `e2e/checkout-session-recovery.spec.ts`: the same in a real browser. The session is ended the way a
  visitor would end it: the same account signs in from a second browser context and signs out of every
  device.

## The Content-Security-Policy, the headers and the favorites of each person

- `scripts/csp.test.ts`: the policy (the exact text, the API address as an origin only and refused when it is
  not `http` or `https`, nothing unsafe or broad, nothing that a `<meta>` tag cannot carry, the header equals
  the tag plus the frame rule) and `policyProblems`, which says what is wrong with the policy of a page.
- `scripts/netlifyHeaders.test.ts`: `netlify.toml` sends, for every path, the policy of the build for the API
  that the same file builds the site for, plus `frame-ancestors 'none'`, and the other headers. The file is
  read as text, with a reader for the part of TOML it uses.
- `npm run check:csp` (a CI step after the build): every HTML file of `dist/`, `404.html` included, has
  exactly one policy tag, and it is the policy of the build. `scripts/siteSmoke.test.mjs` covers the same
  check for a deployed site (`check:site`, given `API_URL`, the API the site was built for).
- `policyProblems` holds a page to the policy of a build for a known API, directive by directive and source
  by source, so a loosened policy is reported, not taken for the right shape: another site in `connect-src`,
  `img-src` or any directive, another API, a directive the site does not have, one that is missing, one that
  comes twice (a browser uses the first), the tag after something that loads, in the body or in a comment,
  and, on their own, `default-src 'none'`, scripts from the site only and nothing unsafe. Each of these was
  broken on purpose to see a test fail.
- `e2e/csp.spec.ts`: eight kinds of page carry the one tag with the policy of the build, and a real browser
  stops inline code, a script and an image from another site, a style attribute and a request to another
  site (and allows the page's own changes to a style through the style object). A violation is a console
  error, which the safety net of the suite turns into a failure, so every other end-to-end test also runs
  under the policy.
- `src/features/favorites/favoritesStore.test.ts`: the lists of the guest and of each account apart, the
  session that ends, stale tabs and other tabs, the limits (100 products, 10 accounts), malformed data, storage
  that cannot be read or written, a reload with and without a stored session, and the removal of the legacy
  key. `src/pages/favoritesIsolation.test.tsx` runs it through the application (header, pages, sign-in and
  sign-out, the API ending a session), and `e2e/favorites-isolation.spec.ts` with two accounts in a real
  browser.

## The rules for a new password

- `src/test/passwordCases.ts`: the passwords that are accepted, refused (and why) or the email, written once,
  with the unusual characters built from their numbers. `src/features/auth/passwordPolicy.test.ts` (the rules,
  the length as typed and as hashed), `schemas.test.ts` (the form: message and field),
  `server/src/auth/schemas.test.ts` (the API) and `passwordAgreement.test.ts` (the same passwords through both:
  they must answer alike) all use it.
- `rules.test.ts`: the length in code points, `passwordKey`, and the hand-written check for a lone surrogate
  against the language's `isWellFormed` for every combination of up to three interesting units.
- Existing accounts: `server/src/auth/passwords.test.ts` verifies hashes made before the change and pins what
  hashing does (NFKC, no trimming, a lone surrogate as U+FFFD, which is why one is refused), and `routes.test.ts`
  signs in accounts whose passwords a new account could not have.
- The list: `src/features/auth/commonPasswords.test.ts` (sorted, once, folded, in range, the credit and licence
  in its header, exact matching only), `scripts/commonPasswords.test.mjs` (the pinned revision, the filter, the
  data file), `scripts/notices.test.mjs` and `npm run check:notices` (a CI step after the build: the chunk that
  has the list has its notice). `openapiContract.test.ts` holds `docs/openapi.yaml` to the code.
- `e2e/password-policy.spec.ts`: a real browser and the API: the hint, a common password and the email refused,
  a phrase with spaces, Hebrew and an emoji accepted and signed in with, and a password with spaces around it
  not signing in without them.
- Each rule was broken on purpose (one change at a time) to see a test fail for the right reason. The changes
  that nothing noticed were one that the API cannot show (it normalizes the email before the password is
  compared, and the form's test shows it), and a missing case (130 typed characters that NFKC shortens to 65),
  which was then added.

## The simulated payment

The cases are named as in [ADR 0014](adr/0014-demo-payment-state-machine.md) and its review.

- `server/src/orders/payment.test.ts`: the rules alone. Each scenario, the deadlines at a millisecond
  either side, the start window (`expiresAt` minus the timeout, exactly, and one millisecond later),
  cancelling against the provider, refunds, a clock that went back, and 40 seeded sequences of requests
  and clocks (also backwards) in which every view must stay consistent and never move back.
- `src/features/orders/payment.test.ts`: the checks the page makes of an answer (W0 to W6) and the
  comparison of two answers, with the cases T1 to T20 (a changed `settlesAt`, attempts out of order,
  a cancellation by another side or at another time, a forgotten ignored confirmation).
- `server/src/orders/service.payment.test.ts`: the service over the in-memory repository, which can do
  what one real MongoDB cannot (a lagging majority, an unconfirmed write, a rollback, a database clock
  that moves between a read and a write or goes back): the start guards (K2a to K2d), the timings kept
  across a change of settings (K1 to K8), a read whose write fails in each way (G2 to G9), 50 requests at
  once (C2 to C7), and the confirmations of P4.
- `server/src/orders/payment.integration.test.ts` (needs `MONGODB_TEST_URI`): the same conditions on a
  real MongoDB's `$$NOW`, a payment that comes back to the millisecond, 50 reads at once with one write
  that matches (C1), a delayed start (K2e) and a delayed cancellation. On a single server this shows
  atomicity and the clock, not durability across a failover, which is not tested anywhere.
- `server/src/orders/routes.payment.test.ts`: strict bodies, the attempt in the address, the owner, the
  shared limit, and a `HEAD` that stores a decision once.
- `src/features/orders/useOrder.test.tsx` and `src/pages/orderPayment.test.tsx`: the page shows only the
  server's answers, polls and stops, keeps an older answer back, stops on a contradiction, starts from
  nothing for another order or session, sends a lost start again with the same key, keeps nothing in
  storage, and says what it should in Hebrew. `orderSchemaCompat.test.ts` holds the site that is live
  while the API is newer to the new answers, and `paymentOpenapiContract.test.ts` holds
  `docs/openapi.yaml` to the code.
- `e2e/demo-payment.spec.ts`: every scenario in a real browser (the end-to-end API decides in a second
  and times out in three), a lost answer, and the axe scan of each state.

## Accessibility tests

Automated checks (axe-core, WCAG 2.0 to 2.2 A and AA rules) find only part of the problems.
Passing them does **not** mean the site is accessible or WCAG-compliant: screen-reader behaviour,
content quality and many criteria need manual review. Alongside the scans, the tests assert
language and direction, accessible names, labels, error associations, keyboard order, focus
management and the mobile menu dialog.

## Quality checks beyond the test suites

Checks that are not tests of behaviour, each with one job:

| Check                       | Command and place                                                                  | What it guards                                                                                                                                                     | Can it fail a pull request? |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| Weight of the first page    | `npm run check:bundle`, in `verify` after the build                                | the JavaScript (160 KiB) and CSS (16 KiB) that `index.html` loads up front, after gzip; today 133 KiB and 7.7 KiB. `scripts/bundleBudget.mjs`                      | yes, and it blocks a deploy |
| Policy of every page        | `npm run check:csp`, in `verify` after the build                                   | every HTML file of `dist/`, `404.html` included, has exactly one Content-Security-Policy tag, and it is the policy of this build (`scripts/csp.ts`)                | yes                         |
| Notice of the password list | `npm run check:notices`, in `verify` after the build                               | the chunk of the build that has the list of common passwords also has its credit and licence (CC BY-SA 3.0, [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)) | yes                         |
| Lighthouse                  | `lighthouse.yml`, budgets in `lighthouserc.json`                                   | accessibility at least 0.95, best practices and SEO at least 0.9, layout shift at most 0.25 (errors); performance at least 0.6 (warning)                           | yes, but not a deploy gate  |
| Production smoke            | `smoke.yml` every night and by hand: `check-api.mjs` (strict) and `check-site.mjs` | the deployed API and the deployed site, from outside: health, products, CORS, headers, catalog drift; home page, a static product page, sitemap, 404               | no (it runs on a schedule)  |

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
   (`npm run check:bundle`), the Content-Security-Policy of every page (`npm run check:csp`), the notice of
   the list of common passwords (`npm run check:notices`) and the API build.
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
