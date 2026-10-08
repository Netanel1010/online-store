# Developer guide

For someone joining the project: how to get it running, where things are, how to work on it, and how
to do the common tasks. The first run is in the README's [Getting Started](../README.md#-getting-started)
and is not repeated here.

## Before you start

- **Node.js 24.** [`.nvmrc`](../.nvmrc) names it (`nvm use`), and CI and Render use the same version.
  The API itself needs Node 22.9 or newer, because it runs TypeScript with type stripping.
- **A MongoDB** to run the site locally (a local `mongod` or a free Atlas cluster). The tests need none,
  except `npm run test:integration`, which wants a MongoDB of your own and refuses an Atlas address
  unless you say so on purpose.
- **Playwright's browser** for the end-to-end tests: `npx playwright install chromium`.
- The user interface is Hebrew and right to left. Code, comments, commits, pull requests and these
  documents are in English.

## The map

```text
src/            the site (React) — see architecture.md#the-site-src
server/         the API (Express) — an npm workspace; its README is the API reference
e2e/            Playwright specs; e2e/support has a stub API that runs the real API code in memory
public/data/    products.json, the one source of the catalog (seed + SEO pages)
scripts/        build helpers (SPA fallback, static pages) and the production check (check-api.mjs)
docs/           this documentation
.github/        ci.yml (checks + deploy), security.yml, dependabot.yml, the pull request template
render.yaml     the Render Blueprint of the API
```

Start with the [architecture overview](architecture.md); the decisions behind it are in
[`adr/`](adr/README.md). The API's contract is [`openapi.yaml`](openapi.yaml), its behaviour is in
[`server/README.md`](../server/README.md).

## Running things

| I want to…                        | Run                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Work on the site                  | `npm run dev:server` (API) and `npm run dev` (site), each in its own terminal |
| Work on the API only              | `npm run dev:server`, and `curl http://localhost:3001/api/health`             |
| Fill my database with the catalog | `npm run seed:products` (needs `MONGODB_URI` in `server/.env`)                |
| See the production build          | `npm run build && npm run preview`                                            |
| Check a deployed API              | `npm run check:api` ([how](deployment.md#verify-a-deployment))                |

The site calls `http://localhost:3001` in development and the API already allows the Vite origins, so
there is nothing to configure. Without a database the API still starts, and the site shows its error
state.

## Before you push

CI runs these, so run the ones that match your change:

| Your change touches…                  | Run                                                                   |
| ------------------------------------- | --------------------------------------------------------------------- |
| Anything                              | `npm run format:check`, `npm run lint`, `npm run typecheck`           |
| The site                              | `npm test`                                                            |
| The API                               | `npm run test:server`                                                 |
| MongoDB queries, indexes, concurrency | `MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:integration` |
| What a visitor sees, or an API answer | `npm run test:e2e` (it builds first)                                  |
| Anything that ships                   | `npm run build`, `npm run check:bundle` and `npm run build:server`    |

`npm run format` fixes formatting. Prettier (no semicolons, single quotes, 100 columns) and ESLint
cover the whole repository, the API included.

## Conventions

- **Branches and commits:** a branch per change, commits like `feat: …`, `fix: …`, `docs: …`,
  `chore: …`. Nothing is committed to `main` directly; the
  [pull request template](../.github/pull_request_template.md) lists what to say and check.
- **Pull requests** have an English title and description, say which checks were run and which were
  not, and contain no secret.
- **Layers on the API:** `routes.ts` reads the request and sends the answer, `service.ts` holds the
  rules, `repository.ts` is the only code that knows MongoDB. A route never imports the driver.
- **Files the API imports from `src/`** (the product schema, cart limits, delivery details, password
  rules, the listing query and search) use `.ts` extensions in their imports and not the `@/` alias,
  because the API runs as Node ES modules. Everything else in `src/` uses `@/`.
- **Errors from the API** are `HttpError(status, code, message)`; the message names a field, never its
  value, and the code is stable because the site and tests depend on it.
- **State in the browser** holds product ids, not products. A new kind of stored data needs a Zod
  schema, because `localStorage` is untrusted.
- **No new dependency** without a reason written in the pull request; the project is deliberately
  small (see [ADR 0010](adr/0010-in-house-limits-and-headers.md)).

## Common tasks

### Add or change a field of a product

1. Edit the schema in `src/features/products/schema.ts`; the API, the seed and the site all use it.
2. Update `public/data/products.json` and the fixtures (`src/test/fixtures.ts`).
3. If the field is searchable, update `server/src/products/searchFields.ts` and raise
   `SEARCH_VERSION`: the API rewrites the stored search text of products that have an older version
   when it starts.
4. Update [`openapi.yaml`](openapi.yaml) (`Product`), run `npm run seed:products`, then
   `npm run check:api` to see that the file and the API agree.

### Add an API endpoint

1. Put the feature in `server/src/<feature>/` with the three layers, and mount its router in
   `server/src/routes/index.ts` (with `databaseNotConfigured` when there is no database).
2. Validate the input with Zod in `schemas.ts`; throw `HttpError` for an expected failure. Protect a
   route with `createRequireAuth` and scope its data to `getAuth(res).user.id`.
3. If it changes data or costs a lot, add a rate limit like `cart/routes.ts` does, in front of the
   authentication so a flood stops early.
4. Test the service over an in-memory repository (`server/src/testing/`) and the routes over HTTP; add
   the repository's queries to the integration tests if MongoDB behaviour matters.
5. If a browser calls it with a method or header CORS does not allow yet, change `app.ts` and
   `scripts/apiHardening.mjs` together (and read [the deploy ordering](runbook.md#release-a-change)).
6. Add it to [`openapi.yaml`](openapi.yaml) and [`server/README.md`](../server/README.md).

### Add a page

1. Add the component in `src/pages/` and the route in `src/app/routes.tsx` (lazy-load it if only some
   visits reach it; wrap it in `RequireAuth` if it needs an account).
2. Ask the API for the products the page shows (`useProductsByIds`, `useProductListing`, …); do not
   read the whole catalog ([ADR 0009](adr/0009-pages-load-only-what-they-show.md)).
3. Set its title and description with `PageMeta`; a page given no `path` is marked `noindex`, which is
   right for private and thin pages ([SEO](seo.md)). Add its path helper to `src/app/paths.ts`.
4. Test it with `renderApp` (`src/test/`), which answers the page with the real API code, and add an
   end-to-end spec if it is a journey.

### Add or change an information page

About, contact, accessibility, privacy and terms are listed once, in `src/lib/infoPages.ts` (path, name, description). That list feeds the route, the footer, the page metadata, the static HTML and the sitemap, so a new page is a new entry there plus a page component built on `InfoPage` (`src/components/shared/InfoPage.tsx`) and a route in `src/app/routes.tsx`.

These pages state facts about the project, and a fact that stops being true is worse than none:

- **Privacy** (`PrivacyPage.tsx`) lists what is stored, where, and what is logged. Change it in the same pull request as a change to what the API stores, what the browser keeps in `localStorage`, or what the API logs.
- **Accessibility** (`AccessibilityPage.tsx`) follows [`accessibility.md`](accessibility.md).
- **Terms** (`TermsPage.tsx`) says that shipping and returns do not apply because nothing is bought. If the store ever takes a real order, those sections and the demo notices must be rewritten by someone who can state real policies.
- **Contact** shows only the GitHub profile and repository (`src/lib/links.ts`). Add an email, a phone number or a WhatsApp link only when the owner provides it.

### Change the catalog

Edit `public/data/products.json`, run the seed, run `check:api`. The production procedure is in the
[runbook](runbook.md#change-the-catalog).

### Record a decision

If a change alters one of the decisions in [`adr/`](adr/README.md), or makes a new one that will be
hard to reverse, write or update an ADR in the same pull request.

## Where the tests are

| Layer                     | Where                                       | Notes                                                                        |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- |
| Site units and components | next to the code, `*.test.ts(x)`            | `renderApp` and `setUpAuthApi` (`src/test/`) run the real API code in memory |
| Build scripts             | `scripts/*.test.mjs`                        | part of `npm test`                                                           |
| API                       | next to the code, `server/src/**/*.test.ts` | in-memory repositories; no MongoDB                                           |
| MongoDB                   | `server/src/**/*.integration.test.ts`       | skipped by `test:server`; run by `test:integration`                          |
| Browser                   | `e2e/*.spec.ts`                             | production build served like GitHub Pages, with a stub API                   |

How and why: [testing](testing.md).

## When something odd happens locally

- **The site shows its error state:** the API is not running, or has no database, or the collection is
  empty (`npm run seed:products`).
- **`.env not found. Continuing without it.`** is fine: every setting has a development default.
- **A Playwright test that is flaky** shows as "flaky" in the log rather than passing silently; do not
  raise timeouts to hide it.
- **The API refuses to start:** its message names the invalid variable (see
  [`server/.env.example`](../server/.env.example)).
- **Anything about production:** the [runbook](runbook.md).
