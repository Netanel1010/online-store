# Deployment

The store runs as three parts. Each one is deployed on its own, and nothing secret is committed.

| Part     | Where                                  | Address                                                                                                                   |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Site     | GitHub Pages (static React build)      | <https://netanel1010.github.io/online-store/>                                                                             |
| API      | Render web service `online-store-api`  | <https://online-store-api-9hz8.onrender.com> (try [`/api/health`](https://online-store-api-9hz8.onrender.com/api/health)) |
| Database | MongoDB Atlas, database `online-store` | Reached only by the API, with the `MONGODB_URI` secret                                                                    |

```text
Browser ── GitHub Pages (React site) ──► Render (Express API) ──► MongoDB Atlas
              static files                GET /api/products…       products collection
```

The site calls the API for the products, the accounts, the signed-in visitor's cart and the orders.
Only the favorites stay in the browser, and the checkout is a demo with no payment (see the
[README](../README.md#-scope--limitations)).

## What is configured where

### Render (the API)

[`render.yaml`](../render.yaml) is a Render Blueprint. It describes a free Node web service in the
Frankfurt region, built straight from this repository (no Docker):

| Setting       | Value                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Build command | `npm ci --include=dev && npm run build:server`                                                   |
| Start command | `npm run start:server`                                                                           |
| Health check  | `/api/health` (never touches the database, so a database blip does not restart a healthy server) |
| Auto deploy   | `checksPass`: Render redeploys only when the CI checks pass for the commit                       |

Environment variables of the service:

| Variable          | Value                           | Where it is set                                                                   |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| `NODE_VERSION`    | `24`                            | `render.yaml`                                                                     |
| `NODE_ENV`        | `production`                    | `render.yaml`                                                                     |
| `PORT`            | chosen by Render                | Render itself, read by the server                                                 |
| `MONGODB_DB_NAME` | `online-store`                  | `render.yaml`                                                                     |
| `CORS_ORIGINS`    | `https://netanel1010.github.io` | `render.yaml`. Scheme and host only: no path, no trailing slash                   |
| `MONGODB_URI`     | the Atlas connection string     | **Render dashboard only** (`sync: false`). It holds the password: never commit it |

`TRUST_PROXY_HOPS` is optional (default `2` in production) and is not in `render.yaml`: see
[Client addresses and rate limits](#client-addresses-and-rate-limits).

In production the server refuses to start without `CORS_ORIGINS` and `MONGODB_URI`, and it connects
to MongoDB before it listens. All variables are described in [`server/README.md`](../server/README.md#configuration).

### GitHub (the site)

The site learns where the API is when it is **built**, from the `VITE_API_URL` variable
([`src/lib/api.ts`](../src/lib/api.ts)). CI sets it from the repository variable `API_URL`:

- **Where:** repository _Settings → Secrets and variables → Actions → Variables_ → `API_URL`.
- **Value:** the API address, e.g. `https://online-store-api-9hz8.onrender.com`. It is public, so it is
  a variable, not a secret.
- **Keep it set.** Without it a production build calls a relative `/api/products` on
  `github.io`, which does not exist, and the deploy-time API check is skipped.
- Changing the value needs a new site build (push to `main`, or run the CI workflow manually on
  `main`): the address is baked into the files.

## How a change reaches production

1. A pull request is merged into `main`.
2. [`ci.yml`](../.github/workflows/ci.yml) runs the `verify` job (format, lint, typecheck, site and
   API tests, site and API builds), the `integration` job (the MongoDB tests, against a throwaway
   MongoDB) and the `e2e` job (Playwright against the production build and a stub API) in parallel.
3. If all three succeed, the `deploy` job runs. When `API_URL` is set it first runs
   [`scripts/check-api.mjs`](../scripts/check-api.mjs) against the production API, and only then
   publishes the site to GitHub Pages. A site whose products cannot be loaded is not published.
4. Render redeploys the API for the same commit once the checks pass (`autoDeployTrigger:
checksPass`). The site and the API are deployed independently of each other: when a change adds
   API parameters that the site starts to send (as the search and filters did), the site can be
   live a few minutes before the API has redeployed, and until then the older API ignores the
   parameters it does not know and lists every product.

   The cart and the orders are the case where the order matters more. The site sends `PUT` and
   `DELETE` for the cart and an `Idempotency-Key` header with an order, and the API only allows
   them from a browser once it has the version that adds them to its CORS settings. Until Render has
   redeployed, a signed-in visitor's cart is kept in the browser only (the site says once that it
   could not be saved in the account, and tries again by itself) and placing an order shows the
   message that the order could not be completed, with its reassurance that a repeat cannot create a
   second order. Nothing is lost or placed twice; it clears up when the API is live. Check it with `STRICT_HARDENING=1 npm run check:api` (below).

To roll back, revert the commit on `main`: CI redeploys both parts from the reverted state.

## Verify a deployment

The production endpoints are public and read-only:

```bash
curl https://online-store-api-9hz8.onrender.com/api/health
# {"status":"ok","uptime":...,"timestamp":"..."}

curl https://online-store-api-9hz8.onrender.com/api/health/ready
# {"status":"ok","database":"up"}

curl "https://online-store-api-9hz8.onrender.com/api/products?limit=1"
# {"items":[{...}],"page":1,"limit":1,"total":...,"totalPages":...}
```

`npm run check:api` runs the full check that the deploy job uses (ready, health, products, CORS for
the site and not for other origins, one product, `404 product_not_found`):

```bash
API_URL=https://online-store-api-9hz8.onrender.com SITE_ORIGIN=https://netanel1010.github.io npm run check:api
```

On PowerShell:

```powershell
$env:API_URL="https://online-store-api-9hz8.onrender.com"; $env:SITE_ORIGIN="https://netanel1010.github.io"; npm run check:api
```

`WAIT_SECONDS` (default 300) is how long it waits for a sleeping host to wake up and reach its database.

`npm run check:api` also reports the HTTP hardening of the API (security headers, CORS, caching; see
[the server README](../server/README.md#behaviour-worth-knowing)). Among them: a preflight answer
that allows `GET`, `POST`, `PUT` and `DELETE` (and not `PATCH`), and the `Authorization` and
`Idempotency-Key` headers. In the deploy job these are
**warnings**, because that job checks the API that is deployed at that moment, which is the one
before the change being deployed. After Render has deployed a new API, run it by hand with
`STRICT_HARDENING=1` to make a missing header an error:

```bash
STRICT_HARDENING=1 API_URL=https://online-store-api-9hz8.onrender.com SITE_ORIGIN=https://netanel1010.github.io npm run check:api
```

## Updating the products

The catalog lives in MongoDB and is served by the API, but its source is
[`public/data/products.json`](../public/data/products.json).

1. Edit `products.json` and merge the change.
2. Copy it to the target database with `npm run seed:products` (see
   [Seed the products](../server/README.md#seed-the-products)). It validates the file first, inserts
   new products, updates changed ones and **never deletes**. Pointing it at production means
   running it from a checkout with the production `MONGODB_URI` in your shell or in the git-ignored
   `server/.env`; take care not to leave that file around.
3. The static SEO pages and the sitemap are generated at build time from the same file
   ([`docs/seo.md`](seo.md)), so the merge also redeploys the site with the new pages.

The seed also stores the text the API's search works on with each product. A database seeded before
the search existed needs no new seed: when the API starts it stores that text for every product
that has none (the Render log says `Search text stored for N product(s)`), which is why its
database user needs permission to write.

A product removed from `products.json` stays in MongoDB until it is removed by hand.

## Authentication in production

Authentication ([`server/README.md`](../server/README.md#authentication)) needs **no new secret and
no new variable**: sessions are random tokens kept (as a digest) in MongoDB, not signed values.

- When the API starts it creates the `users` and `sessions` collections' indexes (a unique email, a
  unique token digest, the one that expires sessions and `userId_createdAt` on the account of a
  session). The last one is new and needs no data migration: the sessions that exist already have
  both fields, an index on a collection this small builds at once, and an account that already has
  more than ten sessions is trimmed at its next sign-in. The database user needs the permission to
  create indexes and to write, which it already needs for the seed and the product indexes.
- The site sends the token in an `Authorization` header, so `CORS_ORIGINS` must name the site's
  origin exactly (it already does). No cookies are used, so nothing about cookies, `SameSite` or
  third-party cookie settings needs configuring, and Safari works.
- Accounts of the first, browser-only version of the site were never on a server: visitors register
  again, and those old records are removed from their browsers when the site loads.
- The limit on failed sign-ins is in the memory of the API process: a restart (Render restarts a
  free service when it wakes up) clears it.
- Nothing in the `products` collection is read or changed by authentication.

To check it by hand against the deployed API (use a throwaway address; the account stays):

```bash
curl -s -X POST "$API_URL/api/auth/register" -H 'Content-Type: application/json' \n  -d '{"name":"Check","email":"check-1@example.com","password":"<a password with a letter and a digit>"}'
curl -s "$API_URL/api/auth/me" -H "Authorization: Bearer <the token of the answer>"
```

## Carts and orders in production

Carts ([`/api/cart`](../server/README.md#cart)) and orders ([`/api/orders`](../server/README.md#orders))
need **no new secret and no new variable**. They use the same database and the same session token as
authentication.

- When the API starts it creates the indexes of two more collections: `carts` (a unique `userId`:
  one cart per account) and `orders` (a unique `orderNumber`, a unique `{ userId, idempotencyKey }`,
  and `{ userId, createdAt, _id }` for the order history). They need no data migration: the
  collections start empty. The database user needs the same permission as before, to write and to
  create indexes.
- Both are protected by the session of the account: a request without a live session is `401`, and
  an account can only ever see its own cart and its own orders.
- Orders hold the delivery details that were typed in (a name, a phone number and an address).
  There is no route that deletes an account or its orders yet. The checkout says that the order and
  the details are kept in the account.
- Nothing in the `products` collection is changed by a cart or an order. They only read it, to refuse
  a product that is not there and to price an order.
- The order and cart limits are in the memory of the process like the others (below).

To check them by hand against the deployed API, with the token of a throwaway account:

```bash
curl -s "$API_URL/api/cart" -H "Authorization: Bearer <token>"
# {"items":[],"updatedAt":null}
curl -s "$API_URL/api/orders" -H "Authorization: Bearer <token>"
# {"items":[],"page":1,"limit":...,"total":0,"totalPages":...}
```

## Client addresses and rate limits

Sign-in and registration are limited per client address (see
[the server README](../server/README.md#authentication)), and so are the routes that change data
for a signed-in visitor: placing an order (20 an hour) and changing a cart (300 in 15 minutes), see
[Carts and orders in production](#carts-and-orders-in-production). The address the server sees is the one in
`X-Forwarded-For`, read from the right past the proxies it trusts: `TRUST_PROXY_HOPS`, default 2 in
production for Cloudflare and Render's load balancer.

Check it once after a deployment, because the right number depends on Render's setup and cannot be
tested from here. Make a request, then look for `"ip"` in its line in the Render logs (see
[Troubleshooting with the logs](#troubleshooting-with-the-logs)) and compare it with your own public
address (for example `curl https://api.ipify.org`):

- it is your address: the setting is right;
- it is an address that is not yours and is the same for every request (a Cloudflare or Render
  address): too few proxies are trusted, so every visitor shares one limit. Raise `TRUST_PROXY_HOPS`;
- it is whatever you put in an `X-Forwarded-For` header you sent yourself: too many are trusted.
  Lower it.

Set it in the Render dashboard (Environment). The limits are in the memory of the process, so they
start again when the free service sleeps or restarts.

## Operating notes

- **Cold starts.** A free Render service sleeps after 15 minutes without a request, so the first
  request after a pause takes about 30 to 60 seconds (measured: 29 s for the catalog). This, not the
  site's size, is what makes the site slow to become usable after a quiet period: the page, scripts
  and banner arrive within about a second, and the products wait for the API. The site softens it:
  the HTML tells the browser to connect to the API and start the catalog request before any script
  runs, a read that fails while the host wakes is repeated (up to three attempts, 30 seconds each),
  a page that is still loading after four seconds explains why, and a returning visitor sees the
  catalog they already have at once (see the `Cache-Control` of the product reads). It cannot make
  the first request after a pause fast: only a host that does not sleep can (a paid Render plan, or
  something that requests `/api/health` more often than every 15 minutes). `check:api` waits for
  this on purpose.
- **Moving the site to another address** means changing `CORS_ORIGINS` (Render) and `SITE_URL`
  ([`src/lib/seo.ts`](../src/lib/seo.ts)).
- **Logs** of the API are in the Render dashboard (see
  [Troubleshooting with the logs](#troubleshooting-with-the-logs)). They never contain the
  connection string, a password or a token, and a client only gets a generic `500 internal_error`
  with a `requestId` to quote.

## Troubleshooting with the logs

Every line the API writes is one JSON object (`level`, `time`, `msg` and fields), in the Render
dashboard under **Logs**. Render's search box filters on text, so search for a field value, for
example `"status":500` or a `requestId`.

Each request ends with one line, `"msg":"request"`:

```json
{
  "level": "warn",
  "time": "2026-10-06T17:14:51.776Z",
  "msg": "request",
  "requestId": "5d0f…",
  "method": "GET",
  "path": "/api/products",
  "status": 404,
  "durationMs": 6.6,
  "ip": "198.51.100.23"
}
```

`info` is a success, `warn` a 4xx or 5xx (a 5xx also has `"outcome":"server error"`), and a request
the client abandoned has `"aborted":true`. Successful `/api/health` checks are not logged (Render
makes them every few seconds). The query string, headers, cookies, bodies, passwords and tokens are
never logged, and a connection string's password is replaced by `***`.

- **A visitor reports an error.** The API's answer to a server error is
  `{"error":{"code":"internal_error","message":"...","requestId":"5d0f…"}}`, and every answer has an
  `X-Request-Id` header (visible in the browser's network tab). Search the logs for that id: the
  `"level":"error"` line has the message, the `stack` and the `cause`; the `request` line has the
  status and the time it took.
- **The site is slow.** Search `"durationMs"` and look for large values. The first request after a
  quiet period is a cold start (see Operating notes), not a bug: the log starts with
  `"msg":"API listening"` when the service has just booted.
- **A request was refused.** `"status":429` is a rate limit (`rate_limited`, or `too_many_attempts`
  for one email) and `"status":503` with `server_busy` or `request_timeout` is load.
- **Is the client address right?** The `ip` of your own request should be your public address
  (see [Client addresses and rate limits](#client-addresses-and-rate-limits)).
- **A caller can name its own request.** An `X-Request-Id` of 8 to 64 letters, digits, `.`, `_` or
  `-` is kept, so a request can be followed from the site to the API; anything else is replaced.

## Troubleshooting

| Symptom                                                                                         | Likely cause and what to check                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The site shows its error state instead of products                                              | `/api/health/ready` first. Then the browser console: a CORS error means `CORS_ORIGINS` does not match the site's origin; a request to `github.io/api/...` means the site was built without `API_URL`.                                                                                                                      |
| `/api/health/ready` answers `503` with `down`                                                   | Atlas is unreachable: check the `MONGODB_URI` secret (special characters in the password must be URL-encoded) and Atlas _Network Access_, which must admit Render.                                                                                                                                                         |
| `/api/products` answers `503 database_not_configured`                                           | `MONGODB_URI` is not set on the service.                                                                                                                                                                                                                                                                                   |
| `/api/products` answers `200` with no items                                                     | The collection is empty: run `npm run seed:products` against that database.                                                                                                                                                                                                                                                |
| The service does not start                                                                      | The Render logs name the invalid variable. Production requires `CORS_ORIGINS` (origins without a path or trailing slash) and `MONGODB_URI`.                                                                                                                                                                                |
| Sign-in or registration says the server cannot be reached                                       | `/api/health/ready`; a request to `github.io/api/...` means the site was built without `API_URL`; a CORS error means `CORS_ORIGINS` does not match the site's origin. A host that is waking up can take about a minute.                                                                                                    |
| A visitor sees "גרסה חדשה של האתר זמינה" (a new version of the site is available)               | A page of the site could not be loaded, which is normal for someone who had the site open during a deployment: the file their old version asks for no longer exists. They reload the page (the button offers it) and it is fixed. If it happens to everyone, the deployment of the site is broken: check the Pages deploy. |
| `/api/auth/*` answers `503 database_not_configured`                                             | `MONGODB_URI` is not set on the service.                                                                                                                                                                                                                                                                                   |
| A visitor's cart is not kept in the account, or placing an order says it could not be completed | The API has not redeployed yet, or its CORS settings are older than the site: a CORS error on `PUT`/`DELETE` `/api/cart…` or on `POST /api/orders` in the browser console. Wait for Render, then run `STRICT_HARDENING=1 npm run check:api`.                                                                               |
| Visitors are signed out after a deploy                                                          | They should not be: sessions are in MongoDB. Check that the `sessions` collection still has its documents and that `MONGODB_DB_NAME` did not change.                                                                                                                                                                       |
| The deploy job fails at "Check the production API"                                              | The step prints which check failed. The same command can be run by hand (above).                                                                                                                                                                                                                                           |
