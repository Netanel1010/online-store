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

The project covers the shopping experience in the browser — from discovering products and filtering the catalog to managing a cart, saving favorites, signing in to a demo account and completing a demo checkout.

The **product catalog is served by a real backend**: an Express API on Render that reads the products from MongoDB Atlas. The site, hosted on GitHub Pages, loads its products from that API.

> 🎯 **Portfolio project:** a frontend-first store with a first backend feature (the Products API) in production.

> **Scope:** the API serves products only. Accounts, cart, favorites and checkout are demo features that run in the browser, and there are no real payments. See [Scope & Limitations](#-scope--limitations).

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
| 🗄️ Database  | MongoDB Atlas                      | The `products` collection, filled by `npm run seed:products`             |

The site loads the whole catalog from `GET /api/products` (following the API's pagination) and a single product from `GET /api/products/:id`. Search, filtering, sorting, the cart and favorites still work on the catalog **in the browser**: there is no search or filter API yet.

How it is deployed, configured and checked: [`docs/deployment.md`](docs/deployment.md).

---

## 🛍️ Features

|     | Feature                 | Description                                                                                     |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| 🏪  | **Product Catalog**     | Hero slider, brands, categories, product listings and product detail pages, loaded from the API |
| 🔌  | **Products API**        | Read-only, paginated REST API backed by MongoDB, with health and readiness checks               |
| 🔎  | **Search**              | URL-based search with shareable and reloadable results                                          |
| 🎛️  | **Filters & Sorting**   | Brand and specification filters with result counts and URL state                                |
| 🛒  | **Shopping Cart**       | Add, remove and update quantities with calculated totals and savings                            |
| ❤️  | **Favorites**           | Save products and access them from a dedicated favorites page                                   |
| 👤  | **Demo Authentication** | Register, log in and log out with protected checkout                                            |
| 💳  | **Demo Checkout**       | Validated delivery form followed by a demo order confirmation                                   |
| 💾  | **Persistence**         | Cart, favorites and session survive browser reloads                                             |
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

This is a **portfolio application**. The product catalog has a real backend; everything else is intentionally a client-side demo.

### What is included

- Product catalog of **31 products**, stored in MongoDB and served by the Products API
- A read-only API: `GET /api/products` (paginated), `GET /api/products/:id`, `GET /api/health` and `GET /api/health/ready`
- A seed command that copies [`public/data/products.json`](public/data/products.json) to MongoDB
- Zod validation of every product the site receives and every product the API reads
- Client-side authentication flow
- Persistent cart and favorites
- Demo checkout flow
- Automated unit, API, E2E and accessibility testing
- GitHub Actions CI/CD, with a production API check before the site is published

### What is intentionally not included

| Limitation                  | Details                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **No Search API**        | Search, filtering and sorting run in the browser over the loaded catalog. The API only lists and returns products                                      |
| ✏️ **Read-Only API**        | The API cannot create, update or delete products. Changes to the catalog go through `products.json` and the seed command                                |
| 🔐 **Demo Authentication**  | Accounts exist only in browser `localStorage`. There is no server-side authentication                                                                  |
| 🛒 **No Server Cart**       | The cart and favorites are stored in the browser, not in the API                                                                                       |
| 💳 **No Real Payments**     | Checkout does not charge money or send payment information                                                                                             |
| 🗄️ **No Server Orders**     | Orders are demo-only and are not stored on a backend                                                                                                   |
| 📦 **No Inventory System**  | Stock and availability are not managed                                                                                                                 |
| 🚚 **No Shipping System**   | Shipping and tax calculations are outside the project scope                                                                                            |

> 🔒 Passwords in the demo authentication flow are stored as salted PBKDF2 hashes. This demonstrates the client-side flow, **not production-grade authentication**.

> ⏱️ The API runs on a free Render plan, which sleeps when idle: the first visit after a pause can wait about a minute for the products to load.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 24** recommended, matching the CI environment (the API needs Node.js 22.9 or newer).
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

- **547** unit and component tests in **42** test files
- **228** API tests in **15** test files, plus **13** optional MongoDB integration tests (in 2 more files) that are skipped unless `MONGODB_TEST_URI` is set
- **222** Playwright E2E tests in **9** test files

The API tests need **no MongoDB and no credentials**.

The E2E suite runs against the production build under the `/online-store/` base path, using the GitHub Pages `404.html` fallback for SPA routing. The site reads its products from a stub API that runs the real API code over in-memory data, so the browser tests need no database either.

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
├── features/     Products, cart, favorites, auth, checkout,
│                 search, notifications, home and shop
├── layouts/      Root layout
├── lib/          API address, formatting, validation and password helpers
├── pages/        Route-level pages
├── services/     Loading and validating products from the API
└── test/         Test setup and helpers

server/           Express + TypeScript API (workspace, see server/README.md)
e2e/              Playwright specs and support code, including a stub API
public/           Static assets and the product data the seed copies to MongoDB
docs/             Design, testing and deployment documentation
scripts/          GitHub Pages build helpers and the production API check
render.yaml       Render Blueprint of the production API
.github/          CI and deployment workflow
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

The `e2e` job runs the Playwright tests against the production build, in parallel.

### Deployment

On pushes to `main`, once `verify` and `e2e` have both succeeded, the `deploy` job:

1. checks the production API with [`scripts/check-api.mjs`](scripts/check-api.mjs) (up, connected to MongoDB, products readable, CORS allowing the site), waiting for a sleeping host to wake up;
2. publishes the site to **GitHub Pages**.

The site is built with `VITE_API_URL` taken from the `API_URL` repository variable, so the deployed site calls the production API. The API itself is deployed by **Render** from `main` once the same checks pass ([`render.yaml`](render.yaml)).

Because GitHub Pages cannot rewrite unknown SPA routes, the build generates a `404.html` fallback from `index.html`.

This allows routes such as:

```text
/online-store/cart
/online-store/favorites
/online-store/checkout
```

to work correctly after deployment.

---

## 📚 Documentation

- 🚢 [`docs/deployment.md`](docs/deployment.md) — Render, Atlas and GitHub Pages: configuration, release flow, verification and troubleshooting
- 🖥️ [`server/README.md`](server/README.md) — the API: running it, MongoDB, endpoints, configuration and structure
- 🧪 [`docs/testing.md`](docs/testing.md) — testing strategy, isolation, accessibility and CI
- 💾 [`docs/state-persistence.md`](docs/state-persistence.md) — cart and favorites persistence
- 🗃️ [`docs/product-data-migration.md`](docs/product-data-migration.md) — product data migration and cleanup
- 🔍 [`docs/seo.md`](docs/seo.md) — page metadata, static pages and the sitemap

---

## 🕰️ Project History

The project originally started as a static **HTML/CSS/JavaScript** website.

It was later rebuilt using **React and TypeScript**, with the original implementation preserved in the [`legacy-v1`](https://github.com/Netanel1010/online-store/tree/legacy-v1) tag. A backend was then added: an Express API with MongoDB, deployed to Render, which now serves the product catalog to the site.

This repository therefore also documents the evolution from a simple static site into a modern component-based frontend application with its own API.

---

## 👨‍💻 Author

Built by [**Netanel1010**](https://github.com/Netanel1010) as part of Software Engineering studies.

---

<p align="center">
  <strong>🛒 Built with React · TypeScript · and a lot of testing.</strong>
</p>
