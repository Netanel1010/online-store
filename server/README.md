# Online Store API

The backend of the online store: **Node.js**, **Express 5** and **TypeScript**. This is the
foundation with a first feature. It has health checks, JSON parsing, CORS, validated
configuration, central error handling, a **MongoDB** connection (the official driver) with a managed
life cycle, and a read-only **Products API** that serves the catalog from MongoDB. The storefront
does not call the API: it still reads `products.json` itself, and accounts, cart and orders live in
the frontend. Authentication, orders and moving the storefront to the API are later steps.

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
allowed by CORS.

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
| `GET /api/products?page=1&limit=20` | One page of products, with the numbers to build a pager         |
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
- **The storefront does not use this API yet.** It still loads `products.json`; moving it to the API
  is a separate step.

Three layers, each with one job: `routes.ts` reads the request and sends the answer, `service.ts`
holds the paging rules and what a missing product means, and `repository.ts` is the only code that
knows MongoDB (the `products` collection, its queries and its index).

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
MongoDB's `_id` stays internal. The API also creates the index when it starts, which does nothing
when it exists.

## Scripts

Run from the repository root (or without `:server`, inside `server/`):

| Command                | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev:server`   | Start with auto-reload (`tsx watch`)                 |
| `npm run test:server`  | Run the tests (Vitest, Node environment, no MongoDB needed) |
| `npm run seed:products` | Copy `public/data/products.json` to MongoDB (see above) |
| `npm run build:server` | Compile to `server/dist` (the server is `dist/server/src/server.js`, next to the three storefront schema files it shares in `dist/src/`) |
| `npm run start:server` | Run the compiled build                               |
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
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:4173`    | Browser origins allowed to call the API, comma separated, with no path. **Required in production.**       |
| `MONGODB_URI`  | not set                                          | MongoDB connection string (`mongodb://` or `mongodb+srv://`). It holds the password. **Required in production.** Not set: the API runs without a database. |
| `MONGODB_DB_NAME` | `online-store`                                | Database to use: 1 to 38 letters, digits, `_` or `-`. Use a different one per environment.               |
| `MONGODB_CONNECT_TIMEOUT_MS` | `5000`                             | How long to look for a reachable MongoDB at startup before giving up (100 to 60000).                     |

## Structure

```text
server/
├── src/
│   ├── server.ts        Entry point: config, database connection, listen, shutdown on SIGTERM
│   ├── app.ts           createApp(): CORS, JSON parsing, routes, 404, error handler
│   ├── config.ts        Environment variables, validated with Zod
│   ├── db/              database.ts (MongoClient, connect, ping, close) and errors.ts
│   ├── products/        The products feature: routes, service, repository, schemas, seed
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
checked for the exact queries it sends. The seed command is started as a real process too, to
check that invalid data stops it before the database is contacted.

An **optional integration test** talks to a real MongoDB. It is skipped unless `MONGODB_TEST_URI`
is set (a local instance or an Atlas cluster you can write to):

```bash
MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:server
```

On PowerShell: `$env:MONGODB_TEST_URI="mongodb://localhost:27017"; npm run test:server`.

It covers what mocks cannot: the unique index, upserts that insert, update and leave unchanged,
that nothing is deleted, paging and counts, and the API over HTTP, against the real server. It works
in a database of its own named `online_store_test_<random>` and drops it at the end. It never uses
`MONGODB_URI` and never touches your development data.

## Behaviour worth knowing

- **Errors** always have the same shape: `{ "error": { "code": "not_found", "message": "..." } }`.
  A route throws `new HttpError(status, code, message)` for an expected failure. Any other error is
  logged with its stack and the client only gets `500 internal_error`, so internals never leak.
- **Unknown routes** get a JSON `404`, also outside `/api`, and malformed JSON gets `400 invalid_json`.
- **CORS** is an allow-list. A browser origin that is not listed gets no CORS headers, so the browser
  blocks it. Requests without an `Origin` (curl, server to server) are not affected. Credentials
  are not enabled yet; they are added together with authentication.
- **Request bodies** are limited to 100 kB.
- **One client**: the process has a single `MongoClient`, which owns the connection pool. It is
  never created per request.
- **Graceful shutdown**: on `SIGTERM` or `SIGINT` the server finishes the requests in progress,
  closes the database connection and exits.
- **After startup**, if the database becomes unavailable the driver reconnects by itself. The API
  keeps running and `/api/health/ready` reports `503` until it is back.
