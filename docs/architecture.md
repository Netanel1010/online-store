# Architecture

How the Online Store is built and why it is shaped this way. It describes the system as it is
after M10. Each part has a document of its own with the details; this one shows how they fit
together and links to them. The decisions behind the shape are recorded in [`adr/`](adr/README.md).

## The system at a glance

```text
                        HTTPS, JSON, Authorization: Bearer <session token>
Browser ───────────────────────────────────────────────────────────────┐
  │ loads the files                                                     ▼
  ▼                                                          Render (free web service)
GitHub Pages                                                  Express 5 API, server/
React single-page app, dist/                                            │ MongoDB driver
(static files, /online-store/)                                          ▼
                                                              MongoDB Atlas, database online-store
                                                              products · users · sessions · carts · orders
```

| Part     | Technology                                            | Where in the repository                                           | Deployed to                                        |
| -------- | ----------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| Site     | React 19, TypeScript, Vite, Tailwind CSS, Zustand     | `src/`, `public/`, `index.html`                                   | GitHub Pages                                       |
| API      | Node.js, Express 5, TypeScript, Zod, `mongodb` driver | `server/` (an npm workspace)                                      | Render, from `render.yaml`                         |
| Database | MongoDB                                               | no code of its own; indexes are created by the API when it starts | MongoDB Atlas                                      |
| Delivery | GitHub Actions                                        | `.github/workflows/`                                              | runs `verify`, `integration`, `e2e`, then `deploy` |

The site and the API are two programs that share one repository and one installation (`npm install`
at the root also installs `server/`). They share **code** too: the API imports the Zod schema of
the product, the lists of brands and categories, the rules of a search query and the cart, delivery and
password rules straight from `src/`, so each rule is written once
([ADR 0004](adr/0004-share-schemas-between-site-and-api.md)). The server's build
(`dist/server/src/server.js`) carries those files next to it in `dist/src/`; nothing is read from the
repository at run time.

What the product is, and what it deliberately is not (a demo checkout, no payment, no roles), is in
the [README](../README.md#-scope--limitations).

## The site (`src/`)

| Folder        | Holds                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/`        | The router (`routes.tsx`), the app shell (`App.tsx`) and path helpers (`paths.ts`)                                                           |
| `pages/`      | One component per route; they compose features and own nothing else                                                                          |
| `features/`   | The behaviour, one folder per area: `products`, `cart`, `favorites`, `auth`, `checkout`, `orders`, `search`, `notifications`, `home`, `shop` |
| `components/` | Shared UI that belongs to no feature: `ui/`, `layout/` and `shared/` (error boundaries, notices, price, breadcrumbs)                         |
| `layouts/`    | `RootLayout`: header, footer, the page's error boundary, and the cart synchronization (`KeepCartSynced`)                                     |
| `services/`   | `productService.ts`: every product request and the validation of what comes back                                                             |
| `lib/`        | The API address (`api.ts`), `fetchWithRetry`, SEO tags, formatting and form validation                                                       |

**Routing.** React Router, served under `/online-store/` (`base` of Vite). The sign-in, registration,
checkout and order pages are loaded on demand. The information pages (about, contact, accessibility,
privacy, terms) are text pages defined by `src/lib/infoPages.ts`, which also feeds the footer, the page
metadata and the static build. `checkout`, `orders` and `orders/:orderNumber` sit
behind `RequireAuth`, which is only the experience: the API decides ([Security](#security)).

**Talking to the API.** `VITE_API_URL` is read when the site is **built** (`src/lib/api.ts`); CI
takes it from the repository variable `API_URL`. Requests go through `fetchWithRetry`: 30 seconds
per attempt and up to three attempts, repeating only on a connection failure, a timeout or a 502,
503 or 504, which is what a sleeping free host looks like. Only requests that are safe to repeat use
it: reads, the cart's `PUT` and `DELETE`, and an order, which carries an `Idempotency-Key`. A
listing that is still loading after four seconds explains that the server may be waking up
(`SlowLoadNotice`). Every product the API sends is validated with the same Zod schema the API stores
it with.

**State.** Three [Zustand](https://zustand.docs.pmnd.rs/) stores with the `persist` middleware, plus
the sync marker, which is a plain `localStorage` entry. None holds product data
([ADR 0006](adr/0006-browser-state-keeps-product-ids-only.md)):

| Store            | `localStorage` key       | Holds                                                                                                                          |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Session          | `online-store:session`   | the session token, its end date and the visitor; the state machine is `restoring`, `authenticated`, `anonymous`, `unavailable` |
| Cart             | `online-store:cart`      | `{ productId, quantity }` lines                                                                                                |
| Cart sync marker | `online-store:cart-sync` | `{ owner, dirty }`: whose cart the browser copy is, and whether it has unsent changes                                          |
| Favorites        | `online-store:favorites` | product ids (browser only, never sent to the API)                                                                              |

A fifth key, `online-store:checkout-attempt`, keeps the `Idempotency-Key` of the order being
placed. Everything read from `localStorage` is validated and treated as untrusted
([state persistence](state-persistence.md#stored-data-is-untrusted)).

**Failure containment.** An error boundary around the page keeps the header and footer alive, and a
last one around the router catches the rest. A page that cannot be loaded after a new deployment says
a new version is available and offers a reload (`lib/chunkError.ts`).

## The API (`server/src/`)

`createApp()` (`app.ts`) builds the Express app without starting it; `server.ts` loads and validates
the configuration, connects to MongoDB **before it listens**, and shuts down cleanly on `SIGTERM`.
Middleware runs in this order: request id and logging, security headers, the 25 s answer timeout,
CORS, JSON parsing (100 kB), the routes under `/api`, a JSON 404, the error handler.

Every feature has the same three layers, which is what makes it testable without a database:

```text
routes.ts       HTTP only: read the request, call the service, send the answer
service.ts      the rules (pricing, merging, limits, what a missing thing means); no HTTP, no MongoDB
repository.ts   the only code that knows MongoDB: queries, indexes
```

| Feature    | Routes                                                                | Notes                                                                     |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `health`   | `GET /api/health`, `GET /api/health/ready`                            | `health` never touches the database; `ready` does                         |
| `products` | `GET /api/products`, `GET /api/products/:id`, `GET /api/categories`   | read-only; search, filters, sorting, paging and filter options in MongoDB |
| `auth`     | `/api/auth/register`, `login`, `logout`, `logout-all`, `me`           | sessions, scrypt passwords, per-address and per-email limits              |
| `cart`     | `/api/cart`, `/api/cart/items`, `/api/cart/items/:productId`          | one cart per account, ids and quantities, revision compare-and-swap       |
| `orders`   | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:orderNumber` | server-side pricing, immutable snapshots, idempotent                      |

The full contract, with every parameter and error, is the [OpenAPI document](openapi.yaml); the
behaviour behind it is in [`server/README.md`](../server/README.md). Without `MONGODB_URI` (development
and test only) the API starts anyway, and every route that needs data answers
`503 database_not_configured`.

**Answers.** Errors are always `{ "error": { "code", "message" } }`, with `requestId` on a 5xx and
`details` where a client can act on them. Anything unexpected is logged with its stack and answered
as a generic `500 internal_error`. Product reads are `Cache-Control: public, max-age=60,
stale-while-revalidate=3600`; everything about an account (auth, cart, orders) and every error is
`no-store`.

### Data

One database (`MONGODB_DB_NAME`, `online-store` in production). The API creates the indexes when it
starts, so there are no migrations to run.

| Collection | One document is           | Key fields and indexes                                                                                                                                                          |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products` | a product                 | the fields of the Zod `productSchema` plus a `search` object (normalized text, never returned); unique `id`                                                                     |
| `users`    | an account                | `id` (UUID), `email` (lower case), `passwordHash`; unique `id` and unique `email`                                                                                               |
| `sessions` | a signed-in browser       | `tokenHash` (SHA-256), `userId`, `createdAt`, `expiresAt`; unique `tokenHash`, TTL on `expiresAt`, `{ userId, createdAt }`                                                      |
| `carts`    | an account's cart         | `userId`, `items[{ productId, quantity }]`, `revision`, `updatedAt`; unique `userId`                                                                                            |
| `orders`   | a placed order, immutable | `orderNumber`, `userId`, `idempotencyKey`, `requestHash`, `lines`, `total`, `delivery`; unique `orderNumber`, unique `{ userId, idempotencyKey }`, `{ userId, createdAt, _id }` |

The catalog is **seeded** from [`public/data/products.json`](../public/data/products.json) with
`npm run seed:products`: validated first, upserted by `id`, never deleting
([ADR 0009](adr/0009-pages-load-only-what-they-show.md)).

## Authentication and sessions

```text
register / login ──► API checks the input and the password (scrypt, constant time)
                     creates a session: a random 256-bit token; only its SHA-256 digest is stored
                 ◄── { user, token, expiresAt }           (the token is shown once)

every later request: Authorization: Bearer <token>
                     API hashes the token, finds a live session (not ended, not expired), loads the account
```

- **Transport:** a bearer token in `Authorization`, kept by the site in `localStorage`. The site and
  the API are different sites, so cookies would be third-party cookies
  ([ADR 0002](adr/0002-bearer-tokens-not-cookies.md)).
- **Session:** opaque and server-side, 7 days, revocable. No JWT and no signing secret
  ([ADR 0003](adr/0003-opaque-sessions-and-scrypt.md)). An account keeps at most 10 sessions (the
  oldest ends at the next sign-in); `POST /api/auth/logout-all` ends all of them.
- **Passwords:** 8 to 128 characters with a letter and a digit, hashed with scrypt from Node's
  `crypto`; a decoy hash makes an unknown email cost as much as a wrong password.
- **Authorization:** one kind of account, no roles. A route is protected by putting `createRequireAuth`
  in front of it, and the cart and orders are always those of the session's account, never one named
  in the request.

## Catalog loading

The site never downloads the catalog. Each page asks the API for exactly what it shows
([ADR 0009](adr/0009-pages-load-only-what-they-show.md)):

| Page or part                             | Request                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Products, category and search pages      | `GET /api/products` with the search, filters and sort, following the pages (100 per page) until the last, plus `facets=true` for the filter options |
| Product page                             | `GET /api/products/:id`                                                                                                                             |
| Home page                                | `GET /api/products?sale=true` and `?recommended=true`                                                                                               |
| Cart, favorites, checkout, an order      | `GET /api/products?ids=…` (at most 100 ids; `useProductsByIds`)                                                                                     |
| Category links                           | `GET /api/categories` (once per visit, `useCategoryCounts`)                                                                                         |
| Search box suggestions                   | `GET /api/products?q=…&limit=5`, 150 ms after the typing pauses                                                                                     |
| Ids left in storage that no longer exist | `ShopStateReconciler` asks about the ids of the cart and favorites when the site opens, and removes the ones the API has no product for             |

The search, filter and sort rules are the storefront's own (`src/features/products/listing/`), and the
API runs the same code, so the same words give the same products on both sides
([ADR 0008](adr/0008-search-and-filtering-in-the-api.md)). `public/data/products.json` is not
published with the site; the build only uses it to write the static SEO pages and the sitemap
([SEO](seo.md)).

## The cart and orders

**Cart.** The pages read and change the cart in the browser, so it is instant and works offline. For
a signed-in visitor, a small engine (`features/cart/cartSync.ts`) mirrors it to `/api/cart` about
400 ms after a change, sending only the lines that differ, repeating when the API cannot be reached.
At sign-in the two copies are joined, sent or replaced depending on the marker; signing out empties
the browser copy and the account keeps its own
([ADR 0007](adr/0007-local-first-cart-mirrored-to-the-account.md); the rules and the table of cases
are in [state persistence](state-persistence.md#keeping-the-cart-in-the-account)).

**Orders.** The checkout sends product ids, quantities, the delivery details, the total the visitor
saw and an `Idempotency-Key`. The API prices the order from its own products, refuses it if the total
is not the one shown (`409 price_changed`) or a product is gone (`409 product_unavailable`), stores an
immutable snapshot of names and prices, and answers a repeat of the same request with the same order
([ADR 0005](adr/0005-orders-priced-and-deduplicated-by-the-api.md)). Placing an order empties the
cart, which the sync engine then sends like any other change. Nothing is charged, shipped or
emailed.

## Security

| Concern                      | Measure                                                                                                                                                                           | Where                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Who may call from a browser  | CORS allow-list (`CORS_ORIGINS`, required in production); methods `GET, HEAD, POST, PUT, DELETE`; no credentials mode                                                             | `app.ts`, `config.ts`                                        |
| Guessing and hashing in bulk | per-address limits (sign-in 30 / 15 min, registration 10 / hour, order 20 / hour, cart change 300 / 15 min), 5 failed sign-ins per email, at most 2 hashes at once with 8 waiting | `middleware/rateLimit.ts`, `auth/`, `lib/concurrencyGate.ts` |
| Which address is counted     | `TRUST_PROXY_HOPS` (2 in production), read from the right of `X-Forwarded-For`                                                                                                    | `config.ts`, `lib/clientKey.ts`                              |
| Response headers             | `nosniff`, `Referrer-Policy: no-referrer`, a CSP that allows nothing, `X-Frame-Options: DENY`, HSTS only over HTTPS                                                               | `middleware/securityHeaders.ts`                              |
| Slow or stuck requests       | 25 s answer timeout (`503 request_timeout`); keep-alive 65 s, headers 66 s, request 120 s                                                                                         | `middleware/requestTimeout.ts`, `lib/serverTimeouts.ts`      |
| Input                        | Zod on every body and query; errors name the field, never the value; bodies capped at 100 kB                                                                                      | `*/schemas.ts`, `products/listQuery.ts`                      |
| Secrets                      | `MONGODB_URI` only in the Render dashboard; logs scrub credentials, tokens, passwords; a repository test looks for credential-shaped text                                         | `lib/logger.ts`, `scripts/secretShapes.mjs`                  |
| Dependencies and code        | `npm audit` of shipped packages and CodeQL (weekly and on every PR), Dependabot, every Action pinned to a commit                                                                  | `.github/workflows/security.yml`, `.github/dependabot.yml`   |
| Production regressions       | `scripts/check-api.mjs` checks the deployed API (health, products, CORS, headers) before the site is published                                                                    | `scripts/`, `ci.yml`                                         |

The rate limits are in the memory of one process: they restart with it, and a scaled-out API would
count per instance ([ADR 0010](adr/0010-in-house-limits-and-headers.md)). The site on GitHub Pages
cannot send response headers, so it has no CSP. The details of each measure, and the milestone that
added it, are in [`server/README.md`](../server/README.md) and the
[M1–M8 progress record](production-roadmap-progress.md).

## Observability

The API writes one JSON object per line (`lib/logger.ts`, no library): one `request` line for each
request (method, path without the query, status, duration, client address; successful health checks
are left out) and an `error` line with the stack for a 500. Every answer carries `X-Request-Id`, and a 5xx body carries the same id as
`requestId`, which is how a visitor's report is found in the Render logs
([runbook](runbook.md#find-what-happened-to-a-request)). There are no metrics and no alerting.

## Delivery

```text
pull request ──► verify · integration · e2e                                (checks only)
push to main ──► verify · integration · e2e ──all pass──► deploy ──► GitHub Pages
                                                  └──────────────► Render (autoDeployTrigger: checksPass)
```

- **`verify`:** formatting, lint, typecheck, site and API unit tests, the site build (with
  `VITE_API_URL`), the weight budget of the first page and the API build.
- **`integration`:** the MongoDB tests against a throwaway MongoDB 8 service container.
- **`e2e`:** Playwright against the production build and a stub API.
- **`deploy`:** `scripts/check-api.mjs` against the production API, then publish to Pages. The check
  is skipped while the repository variable `API_URL` is not set; the site is published either way.
- Three more workflows run on their own and are **not** gates: `security.yml` (audit and CodeQL),
  `lighthouse.yml` (budgets for accessibility, SEO and layout shift) and `smoke.yml` (a read-only check
  of the deployed API and site every night).
- The site and the API are deployed independently, so the order matters when a change adds API
  behaviour the site starts to use ([deployment](deployment.md#how-a-change-reaches-production)).

[ADR 0011](adr/0011-one-workflow-gates-both-deployments.md) explains the gate;
[deployment](deployment.md) has the configuration and [runbook](runbook.md) the procedures.

## Testing

Unit and component tests (Vitest, jsdom), API tests (Vitest, Node), MongoDB integration tests (a real
database, in CI), end-to-end tests (Playwright, against the production build served like GitHub
Pages) and automated accessibility checks (axe-core). The site's tests and the browser tests talk to
the **real API code** over in-memory data instead of a hand-written mock
([ADR 0012](adr/0012-tests-run-the-real-api-code.md)). See [testing](testing.md).

## Where the limits are

Read-only catalog, no roles, no password reset or account page, favorites per browser, no payment,
stock or shipping, rate limits per process, a free API host that sleeps. The complete list, with the
reason for each, is in the README's [Scope & Limitations](../README.md#-scope--limitations) and in
the "Not handled" parts of [state persistence](state-persistence.md#not-handled-yet) and
[M9](m9-server-cart-and-orders.md#known-limits).
