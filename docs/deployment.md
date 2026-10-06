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

The site only calls the API to read products. Accounts, cart, favorites and checkout stay in the
browser (see the [README](../README.md#-scope--limitations)).

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
   API tests, site and API builds) and the `e2e` job (Playwright against the production build and a
   stub API) in parallel.
3. If both succeed, the `deploy` job runs. When `API_URL` is set it first runs
   [`scripts/check-api.mjs`](../scripts/check-api.mjs) against the production API, and only then
   publishes the site to GitHub Pages. A site whose products cannot be loaded is not published.
4. Render redeploys the API for the same commit once the checks pass (`autoDeployTrigger:
checksPass`). The site and the API are deployed independently of each other: when a change adds
   API parameters that the site starts to send (as the search and filters did), the site can be
   live a few minutes before the API has redeployed, and until then the older API ignores the
   parameters it does not know and lists every product.

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

## Operating notes

- **Cold starts.** A free Render service sleeps when it is idle, so the first request after a pause
  can take about a minute. The site shows its loading state until the API answers.
  `check:api` waits for this on purpose.
- **Moving the site to another address** means changing `CORS_ORIGINS` (Render) and `SITE_URL`
  ([`src/lib/seo.ts`](../src/lib/seo.ts)).
- **Logs** of the API are in the Render dashboard. They never contain the connection string, and a
  client only gets a generic `500 internal_error`.

## Troubleshooting

| Symptom                                               | Likely cause and what to check                                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The site shows its error state instead of products    | `/api/health/ready` first. Then the browser console: a CORS error means `CORS_ORIGINS` does not match the site's origin; a request to `github.io/api/...` means the site was built without `API_URL`. |
| `/api/health/ready` answers `503` with `down`         | Atlas is unreachable: check the `MONGODB_URI` secret (special characters in the password must be URL-encoded) and Atlas _Network Access_, which must admit Render.                                    |
| `/api/products` answers `503 database_not_configured` | `MONGODB_URI` is not set on the service.                                                                                                                                                              |
| `/api/products` answers `200` with no items           | The collection is empty: run `npm run seed:products` against that database.                                                                                                                           |
| The service does not start                            | The Render logs name the invalid variable. Production requires `CORS_ORIGINS` (origins without a path or trailing slash) and `MONGODB_URI`.                                                           |
| The deploy job fails at "Check the production API"    | The step prints which check failed. The same command can be run by hand (above).                                                                                                                      |
