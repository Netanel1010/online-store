# Online Store

[![CI](https://github.com/Netanel1010/online-store/actions/workflows/ci.yml/badge.svg)](https://github.com/Netanel1010/online-store/actions/workflows/ci.yml)

A Hebrew, right-to-left online store for PC components, built with **React 19 and TypeScript**. It covers the full shopping flow in the browser: browsing, search and filters, a cart, favorites, a demo account and a demo checkout.

**[Live demo](https://netanel1010.github.io/online-store/)** — deployed to GitHub Pages from `main`.

> **Scope:** this is a frontend portfolio project. There is no backend, no real payment and no real user accounts. See [Scope and limitations](#scope-and-limitations).

## Features

- **Catalog:** a home page with a hero slider, brands and categories; a product listing, 12 category pages and product detail pages. Sale prices show the original price and the saving.
- **Search:** a header search box and a results page, with the query kept in the URL.
- **Filters and sorting:** brand and specification filters built from the catalog data, with a result count per option, and sorting. The state lives in the URL, so a filtered view can be shared, reloaded and used with the back button.
- **Cart:** add products, change quantities, remove them. Totals and savings are calculated from the catalog.
- **Favorites:** a favorites page and a badge in the header.
- **Demo accounts:** register, log in and log out. Checkout is protected, and visitors are returned to the page they came from after logging in.
- **Demo checkout:** a delivery form with validation, then an order confirmation with a demo reference number.
- **Persistence:** cart, favorites and the demo session survive a reload. Only product IDs are stored, never prices or product copies, and stored data is validated when it is read back.
- **Responsive and accessible UI:** mobile menu, RTL layout, keyboard navigation, accessible form errors, and toast notifications in a live region.

## Tech stack

| Area     | Tools                                                                                    |
| -------- | ---------------------------------------------------------------------------------------- |
| UI       | React 19, TypeScript (strict), React Router                                              |
| Styling  | Tailwind CSS 4, with logical properties for RTL                                          |
| State    | Zustand with the `persist` middleware                                                    |
| Forms    | React Hook Form with Zod schemas                                                         |
| Build    | Vite                                                                                     |
| Testing  | Vitest and React Testing Library, Playwright, axe-core (`@axe-core/playwright`)          |
| Quality  | ESLint, Prettier, GitHub Actions                                                         |

## Scope and limitations

The project is deliberately a frontend-only application:

- **No backend.** Product data is a static file, [`public/data/products.json`](public/data/products.json) (31 products), loaded and validated with Zod.
- **Demo authentication.** Accounts exist only in the visitor's browser `localStorage`, with the password stored as a salted PBKDF2 hash. This is a demonstration of the flow, not a secure authentication system.
- **No payments.** Checkout collects delivery details only. Nothing is charged or sent anywhere, and the confirmation is a demo order.
- **No availability, stock, shipping or tax data.** The catalog has none, so the app does not show any.
- **Not a production e-commerce backend.** There are no orders, inventory, payments or user management on a server.

## Getting started

Requires Node.js (CI uses Node 24).

```bash
npm install
npm run dev
```

| Command                | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Start the Vite dev server                          |
| `npm run build`        | Type-check and build for production into `dist/`   |
| `npm run preview`      | Serve the production build locally                 |
| `npm run lint`         | Run ESLint                                         |
| `npm run typecheck`    | Run the TypeScript compiler                        |
| `npm run format:check` | Check formatting with Prettier                     |
| `npm run format`       | Format the code with Prettier                      |
| `npm test`             | Run the unit and component tests (Vitest)          |
| `npm run test:watch`   | Run Vitest in watch mode                           |
| `npm run test:e2e`     | Build the site and run the Playwright tests        |

The first end-to-end run needs the browser: `npx playwright install chromium`.

## Testing

| Layer         | Tool                           | Location                      |
| ------------- | ------------------------------ | ----------------------------- |
| Unit and UI   | Vitest, React Testing Library  | `src/**/*.test.ts(x)`         |
| End-to-end    | Playwright (Chromium)          | `e2e/*.spec.ts`               |
| Accessibility | axe-core in Playwright         | `e2e/accessibility.spec.ts`   |

At the time of writing the suite has 385 unit and component tests in 33 files and 152 Playwright tests in 6 files.

The end-to-end tests run against the production build, served the way GitHub Pages serves it (under `/online-store/`, with a `404.html` fallback). Each test starts with a fresh browser context and registers its own throwaway account. The accessibility tests run axe-core against the main pages and states, and also check language and direction, labels, error messages, keyboard order, focus and the mobile menu. Automated checks cover only part of accessibility, so passing them does not mean the site is WCAG-compliant. More detail is in [`docs/testing.md`](docs/testing.md).

## Project structure

```text
src/
  app/          Routes, path helpers, app shell
  components/   Shared UI: layout, icons, small building blocks
  features/     One folder per area: products, cart, favorites, auth,
                checkout, search, notifications, home, shop
  layouts/      Root layout
  lib/          Shared helpers: formatting, validation, password hashing
  pages/        Route-level pages
  services/     Product data loading and validation
  test/         Test setup and helpers
e2e/            Playwright specs and support code
public/         Static assets and data/products.json
docs/           Design and testing notes
scripts/        Build helper (404.html fallback for GitHub Pages)
.github/        CI and deployment workflows
```

## CI/CD

Two GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml`** runs on pull requests and on pushes to `main`. A `verify` job runs the format check, lint, type check, unit tests and build. A parallel `e2e` job installs Chromium and runs the Playwright suite, and uploads the report as an artifact if it fails.
- **`deploy.yml`** builds the site and deploys it to GitHub Pages on every push to `main`.

Because GitHub Pages cannot rewrite unknown paths, the build copies `index.html` to `404.html` so that deep links such as `/online-store/cart` are resolved by the router.

## Documentation

- [`docs/testing.md`](docs/testing.md) — test layers, isolation, accessibility testing and CI
- [`docs/state-persistence.md`](docs/state-persistence.md) — why cart and favorites persist product IDs only
- [`docs/product-data-migration.md`](docs/product-data-migration.md) — how the product data was migrated and cleaned

## History

The first version of this project was a static HTML, CSS and JavaScript site. It was rebuilt in React and TypeScript, and the original is preserved at the [`legacy-v1`](https://github.com/Netanel1010/online-store/tree/legacy-v1) tag.

## Author

Built by [Netanel1010](https://github.com/Netanel1010) as part of Software Engineering studies.
