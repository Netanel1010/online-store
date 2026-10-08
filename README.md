# 🛒 Online Store

<p align="center">
  <strong>A Hebrew RTL online store for PC components, with a React frontend and a Node.js API</strong>
</p>

<p align="center">
  React 19 · TypeScript · Vite · Tailwind CSS · Zustand · Express 5 · MongoDB · Vitest · Playwright
</p>

<p align="center">
  <a href="https://netanel1010.github.io/online-store/"><strong>🚀 Live Demo</strong></a>
  &nbsp;·&nbsp;
  <a href="https://online-store-api-9hz8.onrender.com/api/health"><strong>🔌 API Health</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Netanel1010/online-store"><strong>💻 Repository</strong></a>
</p>

---

## ✨ Overview

A Hebrew, right-to-left online store for PC components, built with **React 19 and TypeScript**.

The project covers the whole shopping experience — from discovering products and filtering the catalog to managing a cart, saving favorites, signing in to a real account, placing a demo order and reading the order history.

The **product catalog is served by a real backend**: an Express API on Render that reads the products from MongoDB Atlas. The site, hosted on GitHub Pages, loads its products from that API, and the **search, filtering and sorting of the product listings run in the API**, as MongoDB queries. **Accounts and sessions live in the API too**: registration, sign-in and sign-out are real, with the passwords stored only as hashes in MongoDB. So do the **cart** of a signed-in visitor and the **orders** they place: the API prices every order from its own products and stores it in the account.

> 🎯 **Portfolio project:** a frontend-first store with a real backend in production: the Products API, authentication, a server-backed cart and orders.

> **Scope:** the checkout is a **demo**: orders are real records in the account, but nothing is charged, shipped or emailed, and there are no real payments. Favorites stay in the browser. See [Scope & Limitations](#-scope--limitations).

---

## 🧭 Architecture

```text
Browser ── GitHub Pages (React site) ──► Render (Express API) ──► MongoDB Atlas
              static files                GET /api/products…       products collection
```

| Part         | Where                              | Details                                                                  |
| ------------ | ---------------------------------- | ------------------------------------------------------------------------ |
| 🖥️ Site      | GitHub Pages                       | React + Vite single-page app, built and deployed by GitHub Actions       |
| 🔌 API       | Render (free web service)          | Express 5 + TypeScript in [`server/`](server/README.md), deployed from `main` |
| 🗄️ Database  | MongoDB Atlas                      | The `products` collection (filled by `npm run seed:products`), the `users` and `sessions` collections of the accounts, and the `carts` and `orders` collections |

The products, search, category and filtered pages ask `GET /api/products` for the products that match what the visitor typed, ticked and sorted (and for the filter options with their counts), and a product page asks `GET /api/products/:id`. The API does the searching, filtering, sorting and paging in MongoDB.

The site never loads the whole catalog. Every page asks the API only for what it shows: the cart, the favorites, the checkout and an order ask for their products by id (`GET /api/products?ids=…`), the home page for its sale and recommended products (`?sale=true`, `?recommended=true`), the product pages for the category counts of their links (`GET /api/categories`), and the search box for the first five products of the search it is typing (`?q=…&limit=5`).

A signed-in visitor also talks to the API for two more things, always with their session token (`Authorization: Bearer`):

- **The cart** (`/api/cart`). The pages read and change the cart in the browser, so it stays instant and works offline; a small engine mirrors it to the account (a debounced `PUT`/`DELETE` of the quantities that changed, repeated when the API cannot be reached). Signing in joins a cart filled in while signed out with the account's, and signing out empties the cart in the browser while the account keeps it. How the two copies are reconciled: [`docs/state-persistence.md`](docs/state-persistence.md).
- **The orders** (`/api/orders`). The checkout sends only product ids, quantities and the delivery details, with an `Idempotency-Key`; the API works out the prices and the total, stores an immutable snapshot of the order, and answers a repeated request with the same order, so a retry after a timeout can never place a second one.

How the parts fit together and why: [`docs/architecture.md`](docs/architecture.md) and the [decision records](docs/adr/README.md). The API's contract: [`docs/openapi.yaml`](docs/openapi.yaml). How it is deployed, configured and checked: [`docs/deployment.md`](docs/deployment.md), and operated: [`docs/runbook.md`](docs/runbook.md).

---

## 🛍️ Features

|     | Feature                 | Description                                                                                     |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| 🏪  | **Product Catalog**     | Hero slider, brands, categories, product listings and product detail pages, loaded from the API |
| 🔌  | **Products API**        | Read-only REST API backed by MongoDB: server-side search, filters, sorting and paging, with health and readiness checks |
| 🔎  | **Search**              | URL-based search, done by the API, with shareable and reloadable results                        |
| 🎛️  | **Filters & Sorting**   | Brand and specification filters with result counts, filtered and sorted by the API, with URL state |
| 🛒  | **Shopping Cart**       | Add, remove and update quantities with calculated totals and savings; for a signed-in visitor the cart is kept in the account and follows them between devices |
| ❤️  | **Favorites**           | Save products and access them from a dedicated favorites page                                   |
| 👤  | **Authentication**      | Real accounts: register, log in and log out against the API, with server-side sessions and a protected checkout |
| 💳  | **Demo Checkout**       | Validated delivery form; the API prices and stores the order (no payment), and the confirmation is read back from the API |
| 📦  | **Orders**              | An order page that survives a reload, and a "my orders" list in the account menu                |
| 💾  | **Persistence**         | The cart (in the browser and in the account), favorites and the session survive browser reloads |
| 📱  | **Responsive UI**       | Mobile navigation and responsive layouts                                                        |
| ♿  | **Accessibility**       | Keyboard navigation, accessible errors, live-region notifications and automated axe-core checks |
| 🌐  | **RTL Experience**      | Hebrew-first interface with right-to-left layout and logical CSS properties                     |

---

## ⚙️ Tech Stack

| Area                    | Technology                                                  |
| ----------------------- | ----------------------------------------------------------- |
| ⚛️ UI                   | **React 19** · **TypeScript (strict)** · React Router       |
| 🎨 Styling              | **Tailwind CSS 4** · RTL logical properties                 |
| 🧠 State                | **Zustand** with `persist` middleware                       |
| 📝 Forms                | **React Hook Form** · **Zod**                               |
| ⚡ Build                | **Vite**                                                    |
| 🔌 API                  | **Node.js** · **Express 5** · **TypeScript** · **Zod**      |
| 🗄️ Database             | **MongoDB Atlas** with the official `mongodb` driver        |
| 🧪 Unit & UI Testing    | **Vitest** · React Testing Library                          |
| 🎭 E2E Testing          | **Playwright**                                              |
| ♿ Accessibility Testing | **axe-core** · `@axe-core/playwright`                       |
| 🔍 Code Quality         | **ESLint** · **Prettier**                                   |
| 🚀 CI/CD & Hosting      | **GitHub Actions** · **GitHub Pages** (site) · **Render** (API) |

---

## 🎯 Scope & Limitations

This is a **portfolio application**. The product catalog, the accounts, the cart and the orders have a real backend; the checkout is intentionally a demo (no payment, shipping or email) and the favorites are intentionally a browser-side feature.

### What is included

- Product catalog of **31 products**, stored in MongoDB and served by the Products API
- A read-only product API: `GET /api/products` (paginated, with search, category, brand, specification and sort parameters), `GET /api/products/:id`, `GET /api/health` and `GET /api/health/ready`
- A seed command that copies [`public/data/products.json`](public/data/products.json) to MongoDB. That file is the one source of the catalog: the build writes the static pages, the sitemap and the structured data of the products from it too, and `npm run check:api` reports any difference between it and what the API serves
- Zod validation of every product the site receives and every product the API reads
- Limits on the routes that change data: sign-in and registration, placing orders and changing a cart (see [`server/README.md`](server/README.md))
- Authentication in the API: registration, sign-in, sign-out and "who am I", with scrypt-hashed passwords and revocable sessions (see [`server/README.md`](server/README.md#authentication)); the checkout pages need a signed-in visitor
- A server-backed cart per account (`/api/cart`): add, set the quantity, remove and empty, with the same limits as the order (1–99 units, 50 different products), and no price or name stored in it
- Server-side orders (`POST /api/orders`, `GET /api/orders`, `GET /api/orders/:orderNumber`): priced from the API's own products, an immutable snapshot per order, idempotent, scoped to the account that placed them, with order numbers such as `DEMO-7K2M9QX4`
- Cart synchronization in the storefront: the cart is kept in the browser and mirrored to the account, with a merge at sign-in and an empty cart after sign-out
- Persistent favorites (in the browser)
- Demo checkout flow, ending in an order page and an order history
- Automated unit, API, E2E and accessibility testing
- GitHub Actions CI/CD, with a production API check before the site is published

### What is intentionally not included

| Limitation                  | Details                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Suggestions Wait**     | The search suggestions come from the API a moment after the typing pauses, so they are not instant, and a visitor who presses Enter before they arrive searches instead of opening a suggestion |
| ✏️ **Read-Only Catalog**    | The API cannot create, update or delete products. Changes to the catalog go through `products.json` and the seed command                                |
| 🔐 **No Roles**             | There is one kind of account. There are no administrators, no password reset, no email confirmation and no account page                                  |
| ❤️ **Favorites in the Browser** | Favorites are stored in the browser, not in the account                                                                                            |
| 🛒 **Cart Limits**          | A cart holds at most 50 different products (the most one order can hold) and 99 units of each. Changes made on another device appear at the next sign-in or page load, not live |
| 💳 **No Real Payments**     | Checkout does not charge money or send payment information. Every order is a demo order, and the checkout says so                                       |
| 📦 **Orders Are Final**     | An order can be placed and read, but not cancelled or edited, and it has one status. There is no way to delete an account or its orders yet; orders hold the name, phone and address that were entered |
| 📦 **No Inventory System**  | Stock and availability are not managed                                                                                                                 |
| 🚚 **No Shipping System**   | Shipping and tax calculations are outside the project scope                                                                                            |

> 🔒 The accounts of the first, browser-only version of the site were never stored on a server and are not carried over: visitors register again. Anything left of them in a browser is deleted when the site loads.

> ⏱️ The API runs on a free Render plan, which sleeps when idle: the first visit after a pause can wait about a minute for the products to load.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 24** recommended, matching the CI environment (the API needs Node.js 22.9 or newer).
  [`.nvmrc`](.nvmrc) names it for `nvm use`, and CI reads the version from the same file.
- **A MongoDB database** to run the site locally, because the site reads its products from the API and the API reads them from MongoDB. A local MongoDB or a free MongoDB Atlas cluster of your own both work. The tests need none.

### Installation

```bash
npm install
```

### Run the site with its API

1. Point the API at your database in `server/.env` (git-ignored; copy [`server/.env.example`](server/.env.example)):

   ```ini
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB_NAME=online-store-dev
   ```

2. Copy the catalog to the database (once, and again after changing `products.json`):

   ```bash
   npm run seed:products
   ```

3. Start the API and the site, each in its own terminal:

   ```bash
   npm run dev:server   # API on http://localhost:3001
   npm run dev          # site on the local Vite URL shown in the terminal
   ```

In development the site calls `http://localhost:3001` by default, and the API already allows the Vite dev server origin, so nothing else needs configuring. Without a database the API still starts, but the site shows its error state because there are no products to load. MongoDB setup, Atlas and every API setting: [`server/README.md`](server/README.md).

> The production API accepts requests only from the deployed site's origin (CORS), so a local site cannot use it: run the API locally as above.

### Useful commands

| Command                 | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `npm run dev`           | Start the Vite development server                            |
| `npm run build`         | Type-check and create a production build                     |
| `npm run preview`       | Preview the production build                                 |
| `npm run lint`          | Run ESLint                                                   |
| `npm run typecheck`     | Run TypeScript checks                                        |
| `npm run format:check`  | Check formatting with Prettier                               |
| `npm run format`        | Format the project with Prettier                             |
| `npm test`              | Run Vitest unit/component tests                              |
| `npm run test:watch`    | Run Vitest in watch mode                                     |
| `npm run test:e2e`      | Build and run Playwright E2E tests                           |
| `npm run dev:server`    | Start the API with auto-reload ([details](server/README.md)) |
| `npm run test:server`   | Run the API tests                                            |
| `npm run seed:products` | Copy the product catalog to MongoDB                          |
| `npm run build:server`  | Compile the API to `server/dist`                             |
| `npm run start:server`  | Run the compiled API                                         |
| `npm run check:api`     | Check a deployed API the way the deploy job does ([details](docs/deployment.md#verify-a-deployment)) |

For the first E2E run:

```bash
npx playwright install chromium
```

### Configuration

| Variable       | Used by | Purpose                                                                                                                                                         |
| -------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | Site    | Where the API is, read **when the site is built**, without a trailing slash. Defaults to `http://localhost:3001` in development. CI sets it from the repository variable `API_URL` |
| `MONGODB_URI`, `CORS_ORIGINS`, `PORT`, … | API | Described in [`server/README.md`](server/README.md#configuration). The `MONGODB_URI` secret never goes in a committed file |

---

## 🧪 Testing

The project uses multiple testing layers rather than relying on a single test type.

| Layer           | Tool                           | Coverage                    |
| --------------- | ------------------------------ | --------------------------- |
| 🧩 Unit & UI    | Vitest + React Testing Library | `src/**/*.test.ts(x)`       |
| 🔌 API          | Vitest (Node)                  | `server/src/**/*.test.ts`   |
| 🌐 End-to-End   | Playwright                     | `e2e/*.spec.ts`             |
| ♿ Accessibility | axe-core + Playwright          | `e2e/accessibility.spec.ts` |

### Current test suite

- **899** unit, component and script tests in **65** test files
- **1,061** API tests in **47** test files, plus **96** optional MongoDB integration tests (in 5 more files) that are skipped unless `MONGODB_TEST_URI` is set
- **304** Playwright E2E tests in **17** test files

The API tests need **no MongoDB and no credentials**. The optional integration tests run against a real MongoDB what a fake cannot prove: the unique indexes, the atomic cart updates and the idempotent orders when requests arrive at the same moment.

The E2E suite runs against the production build under the `/online-store/` base path, using the GitHub Pages `404.html` fallback for SPA routing. The site talks to a stub API that runs the real API code (products, accounts, carts and orders) over in-memory data, so the browser tests need no database either.

Accessibility tests cover areas including:

- page language and direction
- form labels and validation errors
- keyboard navigation
- focus behavior
- mobile navigation
- main application states

> Automated accessibility checks cover only part of accessibility. Passing them does not mean the application is fully WCAG compliant.

More details: [`docs/testing.md`](docs/testing.md)

---

## 🏗️ Project Structure

```text
src/
├── app/          Routes, path helpers and app shell
├── components/   Shared UI and reusable building blocks
├── features/     Products, cart (and its sync), favorites, auth, checkout,
│                 orders, search, notifications, home and shop
├── layouts/      Root layout
├── lib/          API address, formatting, validation and password helpers
├── pages/        Route-level pages
├── services/     Loading and validating products from the API
└── test/         Test setup and helpers

server/           Express + TypeScript API (workspace, see server/README.md)
e2e/              Playwright specs and support code, including a stub API
public/           Static assets and the product data the seed copies to MongoDB
docs/             Architecture, decision records, OpenAPI, runbook, testing and deployment (start at docs/README.md)
scripts/          GitHub Pages build helpers and the production API check
render.yaml       Render Blueprint of the production API
.github/          CI and deployment workflow, security scans, Dependabot, the pull request template
LICENSE           MIT
```

---

## 🔄 CI/CD

The repository uses **GitHub Actions** for automated verification and deployment, in one workflow (`ci.yml`) so that a deployment only follows the checks of the same commit.

### Continuous Integration

`ci.yml` runs on:

- Pull requests
- Pushes to `main`
- Manual runs (`workflow_dispatch`)

The `verify` job checks:

- formatting
- linting
- TypeScript
- unit/component tests
- API tests
- production build (site and API)

The `integration` job runs the tests of the code that talks to MongoDB (queries, unique indexes, the atomic cart and idempotent order writes) against a real MongoDB that exists only for the job. The `e2e` job runs the Playwright tests against the production build. Both run in parallel with `verify`.

### Deployment

On pushes to `main`, once `verify`, `integration` and `e2e` have all succeeded, the `deploy` job:

1. checks the production API with [`scripts/check-api.mjs`](scripts/check-api.mjs) (up, connected to MongoDB, products readable, CORS allowing the site), waiting for a sleeping host to wake up;
2. publishes the site to **GitHub Pages**.

The site is built with `VITE_API_URL` taken from the `API_URL` repository variable, so the deployed site calls the production API. The API itself is deployed by **Render** from `main` once the same checks pass ([`render.yaml`](render.yaml)).

Because GitHub Pages cannot rewrite unknown SPA routes, the build generates a `404.html` fallback from `index.html`.

This allows routes such as:

```text
/online-store/cart
/online-store/favorites
/online-store/checkout
/online-store/orders/DEMO-7K2M9QX4
```

to work correctly after deployment.

---

## 📚 Documentation

The full index, by what you want to do, is [`docs/README.md`](docs/README.md).

- 🏛️ [`docs/architecture.md`](docs/architecture.md) — the system as it is: the site, the API, the data, sessions, catalog loading, the cart and orders, security and delivery
- 🧭 [`docs/adr/`](docs/adr/README.md) — twelve architecture decision records: why it is built this way
- 📜 [`docs/openapi.yaml`](docs/openapi.yaml) — the API contract (OpenAPI 3.1): every endpoint, parameter, body, answer and error
- 🛠️ [`docs/development.md`](docs/development.md) — the developer guide: setup, the map of the repository, conventions and common tasks (and [`CONTRIBUTING.md`](CONTRIBUTING.md))
- 🚢 [`docs/deployment.md`](docs/deployment.md) — Render, Atlas and GitHub Pages: configuration, release flow, verification and troubleshooting
- 🧯 [`docs/runbook.md`](docs/runbook.md) — production procedures: release, verify, roll back, incidents, rotating the database password
- 🖥️ [`server/README.md`](server/README.md) — the API: running it, MongoDB, endpoints, configuration and structure
- 🧪 [`docs/testing.md`](docs/testing.md) — testing strategy, isolation, accessibility and CI
- 💾 [`docs/state-persistence.md`](docs/state-persistence.md) — cart and favorites persistence, and how the cart is kept in step with the account
- 📦 [`docs/m9-server-cart-and-orders.md`](docs/m9-server-cart-and-orders.md) — the server cart and orders: what was built, the decisions and the limits
- 🗃️ [`docs/product-data-migration.md`](docs/product-data-migration.md) — product data migration and cleanup
- 🔍 [`docs/seo.md`](docs/seo.md) — page metadata, static pages and the sitemap

---

## 🕰️ Project History

The project originally started as a static **HTML/CSS/JavaScript** website.

It was later rebuilt using **React and TypeScript**, with the original implementation preserved in the [`legacy-v1`](https://github.com/Netanel1010/online-store/tree/legacy-v1) tag. A backend was then added: an Express API with MongoDB, deployed to Render, which now serves the product catalog, the accounts, the carts and the orders to the site.

This repository therefore also documents the evolution from a simple static site into a modern component-based frontend application with its own API.

---

## 📄 License

Released under the [MIT License](LICENSE). The licence covers the source code and documentation of this repository. The product names, brands, logos and product images in the catalog are not covered by it: they belong to their owners and appear here only as the content of a demonstration store.

---

## 👨‍💻 Author

Built by [**Netanel1010**](https://github.com/Netanel1010) as part of Software Engineering studies.

---

<p align="center">
  <strong>🛒 Built with React · TypeScript · and a lot of testing.</strong>
</p>
