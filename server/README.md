# Online Store API

The backend of the online store: **Node.js**, **Express 5** and **TypeScript**. It is the
foundation with a first feature. It has health checks, JSON parsing, CORS, validated
configuration, central error handling, a **MongoDB** connection (the official driver) with a managed
life cycle, and a read-only **Products API** that serves the catalog from MongoDB, with the search,
filtering, sorting and paging of the product listings done in MongoDB.

The storefront loads its products from this API, in production (hosted on Render, with MongoDB
Atlas) and in development. Accounts and sessions are in the API ([Authentication](#authentication));
the cart, favorites and orders still live in the frontend: a server cart and orders are later steps. How the API is deployed and checked is in
[`docs/deployment.md`](../docs/deployment.md).

It is an npm workspace of this repository, so one `npm install` at the root installs everything and
the root ESLint, Prettier and TypeScript settings apply to it.

## Run it locally

Requires **Node.js 22.9 or newer** (the repository CI uses 24).

```bash
npm install                 # once, at the repository root
npm run dev:server          # API on http://localhost:3001, restarts on changes
```

```bash
curl http://localhost:3001/api/health
# {"status":"ok","uptime":12,"timestamp":"2026-01-01T12:00:00.000Z"}
```

Run the storefront next to it with `npm run dev`. Its origin (`http://localhost:5173`) is already
allowed by CORS, and in development the storefront calls `http://localhost:3001` by default. The
storefront needs the products in MongoDB, so set `MONGODB_URI` and
[seed the products](#seed-the-products) first.

Node prints `.env not found. Continuing without it.` when there is no `.env` file. That is fine:
every setting has a development default. Without `MONGODB_URI` the API starts without a database
(see below).

## MongoDB

The database is optional in development and test, and **required in production**.

- **No `MONGODB_URI`:** the API logs `MONGODB_URI is not set: running without a database` and
  starts. Working on the storefront or on routes that need no data takes no MongoDB.
- **`MONGODB_URI` set:** the API connects **before it starts listening**. If the database cannot be
  reached within `MONGODB_CONNECT_TIMEOUT_MS`, it stops with exit code 1 and the reason, instead of
  accepting requests it cannot answer. Credentials are never printed.

The same code and the same variables are used for a local MongoDB and for Atlas; only the
connection string differs. Put it in `server/.env` (git-ignored), never in a committed file.

### Local MongoDB

Install MongoDB Community Server (or start any MongoDB instance) and keep it on its default port:

```ini
# server/.env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB_NAME=online-store-dev
```

### MongoDB Atlas

1. Create a cluster (the free tier is enough) and a database user.
2. Under Network Access, allow your IP address.
3. Copy the connection string for drivers (`mongodb+srv://...`) into `server/.env`:

```ini
# server/.env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/
MONGODB_DB_NAME=online-store-dev
```

Special characters in the password must be URL-encoded (`@` is `%40`, `:` is `%3A`, `/` is `%2F`):
a raw `@` makes the driver refuse the string with `Invalid connection string`. `MONGODB_DB_NAME`
decides which database is used; a database name in the connection string is ignored.

### Check the connection

```bash
curl http://localhost:3001/api/health/ready
# {"status":"ok","database":"up"}
```

| Endpoint                | Question                | Answer                                                                                                         |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`       | Is the process up?      | Always `200`. Never touches the database, so a database outage cannot make a host restart a healthy server.    |
| `GET /api/health/ready` | Can it do its work?     | `200` with `database` `up` or `not_configured`, or `503` with `database: "down"`. No details about the cause.  |

## Products API

A read-only API over the products stored in MongoDB. It never reads `products.json`: that file is
only the source of the [seed](#seed-the-products). Without a configured database both endpoints
answer `503 database_not_configured`.

| Endpoint                            | Returns                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `GET /api/products`                 | One page of the products that match the query, with the numbers to build a pager (and, on request, the filter options) |
| `GET /api/products/:id`             | One product, by its id (the manufacturer SKU, e.g. `CC-9011240-WW`) |

```json
{
  "items": [{ "id": "100-000000593", "category": "cpu", "brand": "amd", "name": "...", "...": "..." }],
  "page": 1,
  "limit": 20,
  "total": 31,
  "totalPages": 2
}
```

- **Paging:** `page` is 1 or more (default 1) and `limit` is 1 to 100 (default 20), both plain
  digits. Anything else is `400 invalid_pagination`. A page past the end is `200` with an empty
  `items` and the real `total`. Products are ordered by `id`, so paging is stable. Unknown query
  parameters are ignored.
- **One product:** `:id` may contain letters, digits, `.`, `_` and `-`, up to 64 characters.
  Anything else is `400 invalid_product_id`, and an id that does not exist is
  `404 product_not_found`.
- **The product** has exactly the fields of the storefront's Zod schema
  (`src/features/products/schema.ts`), which is used to validate the seed and every stored document
  that is read. That schema trims text, so a value with a leading space in `products.json` is served
  trimmed. MongoDB's own `_id` is never part of a response.
- **Errors** use the usual `{ "error": { "code", "message" } }` shape. A database failure is a
  generic `500 internal_error`: the details stay in the server log.
- **Caching.** A successful read carries `Cache-Control: public, max-age=60,
  stale-while-revalidate=3600`: for a minute a browser answers a repeated read itself, and for an
  hour after that it shows what it has at once and asks again in the background. A returning
  visitor therefore does not wait for a sleeping host, and a change to the catalog can take up to
  that long to show for someone who already has the old one. An error is never cached. CORS
  preflight answers are cached for ten minutes (`Access-Control-Max-Age`).
- **The storefront uses this API.** The products, category and search pages send the search text,
  the filters and the sort and read the matching products (following the pages until the last) and
  the filter options; a product page reads `GET /api/products/:id`. The whole catalog is also read
  (`GET /api/products?limit=100`) for what needs every product: the cart and favorites, the home
  page sections, the category links and the search suggestions. A `400` or `404` for a product
  means "no such product" to the storefront; any other failure is an error.

### Search, filters and sorting

All parameters are optional and combine: a product has to pass every one of them. A parameter that
is not valid is `400 invalid_query`, in the usual error shape, with a message that names the
parameter and does not repeat what was sent. The paging errors keep their own code,
`invalid_pagination`.

| Parameter       | Meaning                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `q`             | Search text, up to 100 characters (after trimming). Empty or blank means no search. May not be repeated.                                                                                                                                       |
| `category`      | One of the storefront's category ids (`cpu`, `gpu`, ...).                                                                                                                                                                                      |
| `brand`         | A brand id (`amd`, `intel`, ...), repeated for several: a product has one brand, so they are OR-ed.                                                                                                                                            |
| `s.<label>`     | A specification filter: the label (for example `s.תושבת מעבד`, URL-encoded) with the selected value, repeated per value. Values of one label are OR-ed, different labels are AND-ed. Labels and values are up to 100 characters, 60 values in all. |
| `sort`          | `default` (by `id`, or the best match first when there is a search), `price-asc`, `price-desc`, `name-asc` or `name-desc`.                                                                                                                      |
| `facets`        | `true` adds `facets`, the filter options with their counts (see below). `false` is the default.                                                                                                                                                |
| `page`, `limit` | As above.                                                                                                                                                                                                                                      |

These are the filters the storefront has always had (there is no price range, for example), and
the same words, brands and specifications give the same products as before, in the same order.

- **Search.** The text is normalized (lower case, no accents or niqqud, punctuation is only a
  separator) and split into at most 8 words; every word has to match. A word of one or two
  characters matches the start of a word, a longer one any part of a word ("4070" finds
  "N4070GAMING"), and a single word of four or more characters also matches across a space
  ("rtx4070" finds "RTX 4070"). It looks at the name, SKU, brand and category first, and only when
  nothing in the category matches there at all, at the specification values and feature lines too.
  The rules are the storefront's own (`src/features/products/listing/search.ts`), which the API
  shares. MongoDB cannot normalize Hebrew text while it searches, so each product is stored with the
  normalized text of those fields in a `search` object (never returned), and a search is one
  pattern per word on it. The typed text is reduced to letters and digits and escaped, so it cannot
  become a pattern of its own, and the number of words is capped.
- **Ranking.** Without a `sort`, a search lists the best match first (a whole word in the name beats
  a part of a word in the specifications, and so on). That needs every match, so the API reads the
  matches (only those) and pages them itself. With a `sort`, MongoDB sorts and pages.
- **Sorting.** MongoDB sorts with a Hebrew collation in which numbers compare as numbers ("GTX 970"
  before "GTX 1070"); a price sort breaks ties by name, and every sort ends with the `id`, so pages
  never overlap. The values of specification filters are compared as exact text, not with that
  collation, which would take `08GB` for `8GB`.
- **Specification filters** exist within a category, and only for the options that are offered
  there (see below). A selection that is not (an unknown label or value, a label that is not worth a
  filter, or no `category` at all) is ignored instead of returning no products.
- **`total` and `totalPages`** count the products that match, not the whole catalog. Nothing
  matching is `200` with `items: []` and `total: 0`.
- **No new indexes.** The queries filter on small, bounded values of a catalog this size and search
  with unanchored patterns, which no index can serve; the unique index on `id` keeps serving the
  default order and `GET /api/products/:id`.

#### Filter options (`facets=true`)

The filter panel of the storefront, computed by the API with grouped queries so that the counts
agree with the results:

```json
{
  "facets": {
    "brands": [
      { "value": "amd", "count": 3 },
      { "value": "intel", "count": 8 }
    ],
    "specs": [{ "label": "תושבת מעבד", "options": [{ "value": "AM5", "count": 3 }] }]
  }
}
```

- The options that exist depend on the category and the search text, not on what is ticked: the
  brands of those products (none when there is no choice, unless a brand is ticked) and, within a
  category, the specification labels that are worth a filter (see `SPEC_FACET_RULES` in
  `facets.ts`: a label shared by everyone, or with a different value on almost every product, is
  left out). Groups and options are in alphabetical order.
- A `count` answers "how many products would I get if I ticked this?": the other groups' selections
  apply, the option's own group does not, so an option with `0` can be shown as unavailable.

Three layers, each with one job: `routes.ts` reads the request (`listQuery.ts` validates the query
string) and sends the answer, `service.ts` holds the rules (paging, where a search looks, which
specification filters apply, ranking, the filter options) and what a missing product means, and
`repository.ts` is the only code that knows MongoDB (the `products` collection and its queries,
built in `productFilter.ts` and `searchFields.ts`, and its index).

## Authentication

Accounts and sessions live in MongoDB (`users` and `sessions`) and are served by the API under
`/api/auth`. There is one kind of account: a signed-in visitor is the only thing the API tells
apart, and the only protected resource so far is `GET /api/auth/me`. Future features (a server cart,
orders) put `createRequireAuth` in front of their routes (see [Protecting a route](#protecting-a-route)).
No roles exist, because nothing in the store needs them yet.

| Endpoint                   | Needs a token | What it does                                                                                                   |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/register`  | no            | Creates the account and signs it in. `201` with `{ user, token, expiresAt }`.                                  |
| `POST /api/auth/login`     | no            | Checks the credentials. `200` with `{ user, token, expiresAt }`.                                               |
| `GET /api/auth/me`         | yes           | `200` with `{ user }`: who the token belongs to.                                                               |
| `POST /api/auth/logout`    | no (uses it)  | Ends the session of the token it is sent. Always `204`, also for a token that is not a session (nothing is revealed). |

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Dana","email":"dana@example.com","password":"<a password with a letter and a digit>"}'
# {"user":{"id":"…","name":"Dana","email":"dana@example.com"},"token":"<43 characters>","expiresAt":"…"}

curl http://localhost:3001/api/auth/me -H 'Authorization: Bearer <token>'
# {"user":{"id":"…","name":"Dana","email":"dana@example.com"}}
```

**Why bearer tokens and not cookies.** The site (`github.io`) and the API (`onrender.com`) are
different _sites_, so a session cookie would be a third-party cookie, which Safari and a growing
number of browser settings block: sign-in would silently fail for those visitors. A token that the
page sends in `Authorization: Bearer <token>` works the same everywhere, needs no CSRF protection (a
request from another site cannot add the header), and needs no `credentials` in CORS. The price is
that the token is kept in the page's `localStorage`, where a script that ran in the page (an XSS
bug) could read it; the answer to that is the short life of a session, its revocation on sign-out,
and a storefront that renders all text as text, never as HTML.

**Sessions.** A token is 256 random bits (no JWT, nothing to sign, so **no secret to configure**).
The API stores only its SHA-256 digest, with the account, and the moment it ends: 7 days after the
sign-in. A token is valid only while that session exists, so signing out really ends it, on the
server, and a copy of the database cannot be used to sign in. MongoDB removes expired sessions by
itself (a TTL index, about once a minute); the API checks the end date too, because that removal is
not instant. Every sign-in is a session of its own: two browsers do not affect each other.

**Passwords.** At least 8 and at most 128 characters, with a letter and a digit (the form checks the
same rules, from `src/features/auth/rules.ts`, to help the visitor; the API checks them again).
They are hashed with **scrypt**, which ships with Node (`N=2^15, r=8, p=3`, 32 MiB, a random salt per
account, the parameters written into the hash so they can be raised later) and compared in constant
time. A password is never stored, logged, returned or put in a URL, and neither is the hash.
An unknown email is checked against a decoy hash, so it takes as long as a wrong password.

**Errors** use the usual shape. `400 invalid_input` (the message names the field, never the value),
`401 invalid_credentials` (the same for an unknown email and a wrong password),
`401 unauthorized` (no token, or one that is malformed, unknown, expired or ended; with
`WWW-Authenticate: Bearer`), `409 email_taken` (registration), `429 too_many_attempts` (with
`Retry-After`). Every `/api/auth` answer has `Cache-Control: no-store`.

**Limits and trade-offs worth knowing**

- **Failed sign-ins are limited per email**: five failures within fifteen minutes block that email
  for fifteen minutes, whether or not the account exists. It is kept in the process's memory (see
  `auth/throttle.ts`): it starts again with the process, and every instance would count on its own.
  The cost of scrypt is the other half of the defence. A shared store is the next step if the API
  ever runs on several instances.
- **Sign-in and registration are limited per address** (`middleware/rateLimit.ts`, the numbers in
  `auth/routes.ts`): 30 sign-in attempts per 15 minutes and 10 registrations per hour from one
  address, whether they succeed or not, because what is being protected is the cost of hashing.
  Past the limit the answer is `429 rate_limited` with a `Retry-After`, and the request never
  reaches the account or the hash. An IPv6 address is counted as its /64 network. `/me` and
  `/logout` are cheap and are not limited. The limit is shared by everyone behind one address (a
  school, an office), which is why it is not smaller.
- **Hashing is limited in how many run at once** (`lib/concurrencyGate.ts`): two at a time, eight
  more waiting; beyond that a sign-in or registration is answered `503 server_busy` with a
  `Retry-After` at once. Without it a burst of requests would hash in parallel (32 MiB and a lot of
  CPU each) on a small host and slow or crash every other route, the products included.
- **Which address is counted** depends on `TRUST_PROXY_HOPS`, the number of proxies in front of the
  server (default `2` in production: Cloudflare, then Render's load balancer; `0` elsewhere). Too
  few and every visitor looks like the proxy and shares one limit; too many and a visitor could
  name any address in `X-Forwarded-For` and escape it. Check it after a deployment: see
  [deployment](../docs/deployment.md#client-addresses-and-rate-limits).
- **All of these limits are in the memory of the process.** They start again whenever it restarts
  (a free Render service sleeps and restarts), each instance of a scaled-out API would count on its
  own, and a determined attacker with many addresses is not stopped, only slowed. They are meant to
  make guessing and hashing in bulk impractical for one address on one small host. A shared store
  (such as Redis) is the next step if the API ever runs on several instances; it is not needed now.
- **Registration says that an email is taken.** Without an email to confirm the address by, there
  is no other honest answer; sign-in, which is what an attacker would try, never says.
- There is **no password reset, no email confirmation, no change of password and no account page**
  yet: none of them was asked for.
- An account is identified by its `id` (a UUID). The email is stored in lower case, with a unique
  index.

### Protecting a route

```ts
import { createRequireAuth, getAuth } from '../auth/middleware.ts'

router.get('/', createRequireAuth(authService), (_req, res) => {
  const { user } = getAuth(res) // { id, name, email }
  res.json(/* what belongs to user.id */)
})
```

A request without a live session never reaches the route: it gets `401 unauthorized`. This is the
security boundary. The storefront also hides the checkout from signed-out visitors, but that is only
the experience; the API decides, with the same token, on every request.

### Running it locally

Nothing to configure: authentication needs no environment variable. It needs the database (without
`MONGODB_URI` every `/api/auth` endpoint answers `503 database_not_configured`), and it creates its
two collections and their indexes when the API starts. In development the storefront already finds
the API at `http://localhost:3001`, and the API already allows the Vite dev server's origin.

## Seed the products

`npm run seed:products` copies `public/data/products.json` to the `products` collection of the
configured database. It needs `MONGODB_URI`, and is meant to be run from a checkout.

```text
Products seed completed
Inserted: 31
Updated: 0
Unchanged: 0
Total source products: 31
Not in source (left untouched): 0
Database: online-store
```

- **Validated first.** The whole file is checked with the storefront's schema (plus the API's id
  rule) before the database is contacted. One bad product stops the run with exit code 1, a list of
  the problems and nothing written.
- **Upsert by `id`.** A new product is inserted, a product that exists is updated, and one that has
  not changed is left as it is. Running it again changes and adds nothing, and the unique index
  `id_unique` on `id` (created first, if missing) makes a duplicate impossible, even from two runs
  at once. Change a product in `products.json`, run it again, and the same document is updated.
- **It never deletes.** A product that is in the database but no longer in the file is left exactly
  as it is, and counted as `Not in source`. Other documents in the collection are never touched.
  Removing products from MongoDB is a deliberate manual step.
- **A different file:** `npm run seed:products -- path/to/products.json`.

`id` is the stable identifier of a product (the manufacturer SKU, as in the storefront's URLs).
MongoDB's `_id` stays internal. The seed also stores each product's `search` text (see above), and
the API does the same when it starts for any product that has none or an older version of it: a
database seeded before the search existed becomes searchable just by starting the API (the log
says `Search text stored for N product(s)`). It also creates the index when it starts. Both do
nothing when there is nothing to do, and the API needs permission to write for them.

## Scripts

Run from the repository root (or without `:server`, inside `server/`):

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev:server`   | Start with auto-reload (`tsx watch`)                 |
| `npm run test:server`  | Run the tests (Vitest, Node environment, no MongoDB needed) |
| `npm run seed:products` | Copy `public/data/products.json` to MongoDB (see above) |
| `npm run build:server` | Compile to `server/dist` (the server is `dist/server/src/server.js`, next to the three storefront schema files it shares in `dist/src/`) |
| `npm run start:server` | Run the compiled build (what Render runs in production) |
| `npm run check:api`    | Check a running API: health, readiness, products, CORS (see [deployment](../docs/deployment.md#verify-a-deployment)) |
| `npm run typecheck`    | Type-check the site, the tests and the API together  |
| `npm run lint`         | ESLint for the whole repository, API included        |

## Configuration

Settings come from environment variables, validated once at startup (`src/config.ts`): an invalid
value stops the server with a message that names it. Copy [`.env.example`](.env.example) to `.env`
to change them; `.env` is git-ignored.

| Variable       | Default                                          | Meaning                                                                                                   |
| -------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `development`                                    | `development`, `test` or `production`                                                                     |
| `PORT`         | `3001`                                           | Port to listen on                                                                                         |
| `TRUST_PROXY_HOPS` | `0` (`2` in production)                       | How many proxies are in front of the server, so the limits count the visitor (0 to 5)                 |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173`    | Browser origins allowed to call the API, comma separated, with no path. **Required in production.**       |
| `MONGODB_URI`  | not set                                          | MongoDB connection string (`mongodb://` or `mongodb+srv://`). It holds the password. **Required in production.** Not set: the API runs without a database. |
| `MONGODB_DB_NAME` | `online-store`                                | Database to use: 1 to 38 letters, digits, `_` or `-`. Use a different one per environment.               |
| `MONGODB_CONNECT_TIMEOUT_MS` | `5000`                             | How long to look for a reachable MongoDB at startup before giving up (100 to 60000).                     |

## Production

The API runs on **Render** as the web service `online-store-api`, described by
[`render.yaml`](../render.yaml) at the repository root, with its data in **MongoDB Atlas**. In
production `CORS_ORIGINS` (the site's origin) and `MONGODB_URI` are required, and the connection
string is entered in the Render dashboard, never committed. Render uses `/api/health` as its health
check, and `/api/health/ready` is the check that includes the database. Configuration, how a
change is released, verification commands and troubleshooting are in
[`docs/deployment.md`](../docs/deployment.md). Authentication needs **no new variable and no
secret** (see [Authentication](#authentication)).

## Structure

```text
server/
├── src/
│   ├── server.ts        Entry point: config, database connection, listen, shutdown on SIGTERM
│   ├── app.ts           createApp(): CORS, JSON parsing, routes, 404, error handler
│   ├── config.ts        Environment variables, validated with Zod
│   ├── db/              database.ts (MongoClient, connect, ping, close) and errors.ts
│   ├── auth/            The authentication feature: routes, service, middleware, user and session
│   │                    repositories, passwords (scrypt), tokens, the sign-in limit, schemas
│   ├── products/        The products feature: routes, query parsing, service, repository, filters
│   │                    and search text, filter options, schemas, seed
│   ├── routes/          One router per feature, mounted under /api in routes/index.ts
│   ├── scripts/         Commands run from a checkout (seedProducts.ts)
│   ├── middleware/      notFound and the central errorHandler
│   ├── lib/             HttpError, the error a route throws on purpose
│   └── testing/         Test helpers: a free-port server, fixtures, an in-memory repository
├── tsconfig.json        Type-checking, tests included
└── tsconfig.build.json  Production build to dist/
```

`app.ts` builds the app and `server.ts` listens, so the tests run the real app on a free port
without starting the real server. `server.ts` also creates and connects the database and hands it
to `createApp`: the app never opens a connection of its own, and routes receive the database they
need instead of importing a global.

## Tests

`npm run test:server` needs **no MongoDB and no credentials**, so it is what CI runs. The driver is
replaced by a stand-in for the life-cycle tests, a real driver is pointed at an address nothing
listens on to check the failure path, and the entry point is started as a real process to check
that a bad configuration or an unreachable database stops it with exit code 1. The products
service, routes and seed are tested over an in-memory repository, and the real repository is
checked for the exact queries it sends. The search patterns and filters are also evaluated on the
real catalog and compared with the storefront's own search. The seed command is started as a real
process too, to check that invalid data stops it before the database is contacted.

Authentication is tested at each level: the password hashing and the tokens, the request
validation, the sign-in limit (with a clock the test moves), the service (registration, sign-in,
sessions that expire and end), the middleware and the routes over HTTP with in-memory repositories
(including that no answer contains a password, a hash or a token that was not just issued), the
exact queries of the repositories, and CORS for the `Authorization` header.

An **optional integration test** talks to a real MongoDB. It is skipped unless `MONGODB_TEST_URI`
is set (a local instance or an Atlas cluster you can write to):

```bash
MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:server
```

On PowerShell: `$env:MONGODB_TEST_URI="mongodb://localhost:27017"; npm run test:server`.

It covers what mocks cannot: the unique index, upserts that insert, update and leave unchanged,
that nothing is deleted, paging and counts, the search text and its backfill, and the API over HTTP,
against the real server. It also asks the API over MongoDB and the API over the in-memory repository
the same questions (searches, filters, sorts, pages, filter options) and expects the same answers.
A second file does the same for accounts and sessions: the unique indexes (also when five
registrations of one email arrive at once), the index that expires sessions, that a password is
stored only as a hash, and registration, sign-in, `me` and sign-out over HTTP. They work
in a database of its own named `online_store_test_<random>` and drops it at the end. It never uses
`MONGODB_URI` and never touches your development data.

## Behaviour worth knowing

- **Errors** always have the same shape: `{ "error": { "code": "not_found", "message": "..." } }`.
  A route throws `new HttpError(status, code, message)` for an expected failure. Any other error is
  logged with its stack and the client only gets `500 internal_error`, so internals never leak.
- **Unknown routes** get a JSON `404`, also outside `/api`, and malformed JSON gets `400 invalid_json`.
- **CORS** is an allow-list. A browser origin that is not listed gets no CORS headers, so the browser
  blocks it. Requests without an `Origin` (curl, server to server) are not affected. Credentials are
  deliberately not enabled: authentication uses an `Authorization` header, not cookies, so a page
  of another origin cannot ride on a visitor's session (a request with that header is first
  checked by the browser with a preflight, which the same allow-list answers).
- **Response headers** (`middleware/securityHeaders.ts`): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, a `Content-Security-Policy` that allows nothing and no frames
  (the API only answers JSON), `X-Frame-Options: DENY`, and `Strict-Transport-Security` only when
  the request really came over HTTPS (see `TRUST_PROXY_HOPS`). No framework such as Helmet is used:
  this is all an API that serves JSON needs. Every error answer is `Cache-Control: no-store`.
- **CORS** offers only `GET`, `HEAD` and `POST`, the headers `Authorization` and `Content-Type`, lets a
  page read `Retry-After`, and lets a browser keep a preflight answer for ten minutes.
- **Timeouts:** an answer that takes longer than 25 seconds is replaced by `503 request_timeout`
  (the work itself is not stopped). The server keeps idle connections for 65 seconds, longer than a
  proxy keeps its own, so a reused connection is never closed under it (that race shows up as an
  occasional `502`), and a client has two minutes at most to send a request.
- **Request bodies** are limited to 100 kB.
- **One client**: the process has a single `MongoClient`, which owns the connection pool. It is
  never created per request.
- **Graceful shutdown**: on `SIGTERM` or `SIGINT` the server finishes the requests in progress,
  closes the database connection and exits.
- **After startup**, if the database becomes unavailable the driver reconnects by itself. The API
  keeps running and `/api/health/ready` reports `503` until it is back.
