# Production runbook

The procedures for running the store in production: releasing, checking, rolling back and handling
the things that go wrong. It tells you **what to do**; the configuration behind each step, and the
symptom-by-symptom table, are in [`deployment.md`](deployment.md), which this page does not repeat.

## Who and what

There is one owner (the repository owner, [Netanel1010](https://github.com/Netanel1010)) and no
on-call rota or escalation chain. Access to three places is needed:

| Place                                  | What it is for                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GitHub repository                      | merging, Actions logs, the `API_URL` variable (_Settings → Secrets and variables → Actions → Variables_) |
| Render, service `online-store-api`     | the API's logs, its environment variables (`MONGODB_URI`, `TRUST_PROXY_HOPS`), deploy history            |
| MongoDB Atlas, database `online-store` | the data, the database user, _Network Access_                                                            |

| Part | Address                                                                                                                                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site | <https://netanel1010.github.io/online-store/>                                                                                                                                                             |
| API  | <https://online-store-api-9hz8.onrender.com> ([`/api/health`](https://online-store-api-9hz8.onrender.com/api/health), [`/api/health/ready`](https://online-store-api-9hz8.onrender.com/api/health/ready)) |

## Is it up?

```bash
curl -s https://online-store-api-9hz8.onrender.com/api/health/ready
# {"status":"ok","database":"up"}
```

- **No answer for up to a minute, then `ok`:** the free host was asleep. That is normal, not an incident.
- **`503` with `"database":"down"`:** the API is running but cannot reach Atlas: go to
  [The site shows an error instead of products](#the-site-shows-an-error-instead-of-products).
- **The full check** (what the deploy job runs, and more): `npm run check:api`, see
  [Verify a deployment](deployment.md#verify-a-deployment).

## Release a change

1. Merge the pull request into `main` after its checks (`verify`, `integration`, `e2e`) have passed.
2. The same workflow runs on `main`. When all three pass, `deploy` checks the production API and
   publishes the site; Render redeploys the API for the same commit. Watch the _Actions_ tab and the
   deploy in the Render dashboard.
3. When both are live, run the strict check from a checkout. It turns the hardening and catalog
   warnings of the deploy job into errors, and shows whether the API has caught up with the site:

   ```bash
   STRICT_HARDENING=1 API_URL=https://online-store-api-9hz8.onrender.com SITE_ORIGIN=https://netanel1010.github.io npm run check:api
   ```

4. Open the site and look at the home page, a product, the cart and (signed in) "my orders".

**Order matters when a change adds API behaviour that the site uses.** The site can go live minutes
before the API. Until Render has redeployed, a signed-in visitor's cart is kept in the browser only
and placing an order says it could not be completed (nothing is lost or placed twice), and the home
page, cart and favorites show errors if the API does not know a new query parameter. Check the API
first when the change is of this kind. Details: [How a change reaches
production](deployment.md#how-a-change-reaches-production).

## Roll back

Revert the commit on `main` (`git revert <sha>`, through a pull request): CI redeploys both parts from
the reverted state. Things to know:

- **Data is not rolled back.** The API creates its indexes when it starts and has no migrations, so a
  revert never touches the data, and the seed never deletes: a product added to MongoDB stays there.
- **Sessions survive a deploy or a rollback** (they are in MongoDB). Visitors are not signed out.
- A rollback that removes API parameters the site still sends has the same ordering problem as a
  release: revert both in one commit.
- **Pages keeps the last good site if `deploy` fails**, because nothing is published unless the job
  succeeds. The API on Render is separate: it deploys only when the checks pass, and a failed Render
  deploy leaves the previous version running.

## A deploy failed

| Where it failed                       | What it means and what to do                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify`, `integration` or `e2e`      | Nothing was deployed (Pages or Render). Fix the failing check on a branch. A Playwright failure keeps its report and traces as an artifact for 7 days.                                                                                                                                                              |
| `deploy` → "Check the production API" | The step prints which check failed; run the same command by hand ([above](#is-it-up)). A host that is asleep is waited for (up to five minutes); a check that still fails is real.                                                                                                                                  |
| `deploy` → `Cannot find package …`    | The deploy job runs `scripts/check-api.mjs`, which imports from the repository, so the job must install the production dependencies (`npm ci --omit=dev --ignore-scripts`, already in `ci.yml`). A missing package means that step was removed or a new import needs a package that is not a production dependency. |
| `deploy` → publishing to Pages        | Re-run the job from the Actions tab. The site that was live before stays live.                                                                                                                                                                                                                                      |
| Render shows a failed deploy          | Open its log: an invalid environment variable stops the server at start-up with a message that names it (production requires `CORS_ORIGINS` and `MONGODB_URI`). The old version keeps running.                                                                                                                      |

A manual redeploy of the site, without a code change, is _Actions → CI → Run workflow_ on `main`.

## The site shows an error instead of products

Work from the outside in and stop at the first thing that is wrong:

1. `curl …/api/health/ready` (above). Asleep: wait a minute. `database: down`: step 4.
2. Open the site's browser console and network tab.
   - A request to `github.io/api/…`: the site was built without `API_URL`. Set the repository
     variable and rebuild (push to `main`, or run the workflow).
   - A CORS error: `CORS_ORIGINS` on Render must be exactly the site's origin
     (`https://netanel1010.github.io`, no path, no trailing slash).
3. `curl …/api/products?limit=1`: `503 database_not_configured` means `MONGODB_URI` is not set;
   `200` with no items means the collection is empty (run `npm run seed:products` against that database).
4. Atlas unreachable: the `MONGODB_URI` secret (special characters in the password must be
   URL-encoded) and Atlas _Network Access_, which must admit Render.
5. The Render logs ([next section](#find-what-happened-to-a-request)).

The same table, by symptom, is [Troubleshooting](deployment.md#troubleshooting).

## Find what happened to a request

Every API answer has an `X-Request-Id` header, and a server error also carries it as
`error.requestId`. A visitor who reports a problem can read it in the browser's network tab.

1. Render dashboard → the service → **Logs**.
2. Search for the id. The `"level":"error"` line has the message, stack and cause; the
   `"msg":"request"` line has the status and `durationMs`.
3. For slow requests search `"durationMs"`; for refusals `"status":429` (a rate limit) or
   `"status":503` (`server_busy` or `request_timeout`).
4. A line `"msg":"API listening"` means the service had just booted (a cold start).

What a line looks like, and what is never logged, is in
[Troubleshooting with the logs](deployment.md#troubleshooting-with-the-logs). Logs are only as
long-lived as Render keeps them.

## Check that the client address is right

The rate limits count visitors by the address in `X-Forwarded-For`, read from the right past
`TRUST_PROXY_HOPS` proxies (2 in production). The right number depends on Render's setup and cannot
be proven from outside, so check it once after the first deployment and again if Render changes its
network: make a request, find its line in the logs, and compare `ip` with your own public address.
The three outcomes and what to change are in
[Client addresses and rate limits](deployment.md#client-addresses-and-rate-limits).

## Change the catalog

1. Edit [`public/data/products.json`](../public/data/products.json) and merge it.
2. Copy it to production: `npm run seed:products` from a checkout, with the production `MONGODB_URI` in
   your shell or in the git-ignored `server/.env`. It validates first, inserts and updates, and never
   deletes. Do not leave the production URI in a file afterwards.
3. Run `STRICT_HARDENING=1 npm run check:api`: it names any product that is missing, extra or different
   between the file and the API.
4. A product removed from the file stays in MongoDB until it is removed by hand in Atlas.

The merge also rebuilds the static SEO pages and the sitemap from the same file
([SEO](seo.md)). Details: [Updating the products](deployment.md#updating-the-products).

## Rotate the database password

Do this when the password may have been exposed, and otherwise from time to time.

1. In Atlas, change the password of the database user (or create a new user and delete the old one
   after the switch). URL-encode special characters in the new password.
2. Replace `MONGODB_URI` in the Render dashboard (_Environment_). Never put it in a committed file.
3. Make sure the service has restarted with the new value: the log shows `"msg":"API listening"` and
   `/api/health/ready` answers `database: up`.
4. Visitors stay signed in: sessions are in the database, not signed with the password.

If the connection string was committed or posted anywhere, treat it as exposed and rotate it at once;
the repository has a test that fails when a credential-shaped string is tracked, and GitHub's push
protection is the second line.

## Other settings

| Change                            | Where                                                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| The number of trusted proxies     | Render → Environment → `TRUST_PROXY_HOPS` (0 to 5; not in `render.yaml`)                                    |
| The site moves to another address | `CORS_ORIGINS` in `render.yaml`, `SITE_URL` in [`src/lib/seo.ts`](../src/lib/seo.ts), then rebuild the site |
| The API moves to another address  | The repository variable `API_URL`, then rebuild the site (the address is baked into the files)              |
| The Node version                  | [`.nvmrc`](../.nvmrc) for CI; `NODE_VERSION` in `render.yaml` for Render                                    |

## Dependency and security alerts

- **Dependabot** opens one grouped pull request a week for npm (majors on their own) and one for the
  Actions. Merge them like any change: the checks decide.
- **`security.yml`** runs `npm audit --omit=dev --audit-level=high` and CodeQL on pull requests, on
  `main` and weekly. It is **not a deploy gate**: a red result is a to-do, not an outage. Fix the
  advisory, or dismiss a false alert with the reason (CodeQL may report a missing rate limit on a route
  that the in-house limiter covers, [ADR 0010](adr/0010-in-house-limits-and-headers.md)).

## What this repository does not give you

State these before relying on the system for anything that matters:

- **No backups or restore procedure** are defined here. Decide what Atlas keeps for the cluster's
  plan before the data matters.
- **No metrics or alerting.** The only signals are the logs, the health endpoints and the deploy job.
- **No way to delete an account or its orders.** Removing a person's data is a manual operation in
  Atlas, across `users`, `sessions`, `carts` and `orders` (all keyed by the account's `userId`). Orders
  hold the name, phone and address that were entered.
- **No second instance.** The rate limits are per process; see
  [ADR 0010](adr/0010-in-house-limits-and-headers.md) before scaling out.
- **The first request after 15 idle minutes takes 30 to 60 seconds** on the free plan. Only a host
  that does not sleep removes it.
