# 🛒 Online Store

<p align="center">   <strong>A modern Hebrew RTL e-commerce frontend for PC components</strong> </p>

<p align="center">   React 19 · TypeScript · Vite · Tailwind CSS · Zustand · Vitest · Playwright </p>

<p align="center">   <a href="https://netanel1010.github.io/online-store/">     <strong>🚀 Live Demo</strong>   </a>    ·    <a href="https://github.com/Netanel1010/online-store">     <strong>💻 Repository</strong>   </a> </p>

<p align="center">

</p>

---

## ✨ Overview

A Hebrew, right-to-left online store for PC components, built with **React 19 and TypeScript**.

The project covers the complete shopping experience in the browser — from discovering products and filtering the catalog to managing a cart, saving favorites, signing in to a demo account and completing a demo checkout.

> 🎯 **Portfolio project:** frontend-focused, fully client-side and deployed with GitHub Pages.

**🚀 Open the Live Demo →**

> **Scope:** There is no backend, real payment processing or real user accounts. See [Scope & Limitations](#-scope--limitations).

---

## 🛍️ Features

|     | Feature                 | Description                                                                                     |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| 🏪  | **Product Catalog**     | Hero slider, brands, categories, product listings and product detail pages                      |
| 🔎  | **Search**              | URL-based search with shareable and reloadable results                                          |
| 🎛️ | **Filters & Sorting**   | Brand and specification filters with result counts and URL state                                |
| 🛒  | **Shopping Cart**       | Add, remove and update quantities with calculated totals and savings                            |
| ❤️  | **Favorites**           | Save products and access them from a dedicated favorites page                                   |
| 👤  | **Demo Authentication** | Register, log in and log out with protected checkout                                            |
| 💳  | **Demo Checkout**       | Validated delivery form followed by a demo order confirmation                                   |
| 💾  | **Persistence**         | Cart, favorites and session survive browser reloads                                             |
| 📱  | **Responsive UI**       | Mobile navigation and responsive layouts                                                        |
| ♿   | **Accessibility**       | Keyboard navigation, accessible errors, live-region notifications and automated axe-core checks |
| 🌐  | **RTL Experience**      | Hebrew-first interface with right-to-left layout and logical CSS properties                     |

---

## ⚙️ Tech Stack

| Area                    | Technology                                            |
| ----------------------- | ----------------------------------------------------- |
| ⚛️ UI                   | **React 19** · **TypeScript (strict)** · React Router |
| 🎨 Styling              | **Tailwind CSS 4** · RTL logical properties           |
| 🧠 State                | **Zustand** with `persist` middleware                 |
| 📝 Forms                | **React Hook Form** · **Zod**                         |
| ⚡ Build                 | **Vite**                                              |
| 🧪 Unit & UI Testing    | **Vitest** · React Testing Library                    |
| 🎭 E2E Testing          | **Playwright**                                        |
| ♿ Accessibility Testing | **axe-core** · `@axe-core/playwright`                 |
| 🔍 Code Quality         | **ESLint** · **Prettier**                             |
| 🚀 CI/CD                | **GitHub Actions** · **GitHub Pages**                 |

---

## 🎯 Scope & Limitations

This project is intentionally designed as a **frontend-only portfolio application**.

### What is included

* Static product catalog with **31 products**
* Product data loaded from [`public/data/products.json`](public/data/products.json)
* Zod validation for loaded product data
* Client-side authentication flow
* Persistent cart and favorites
* Demo checkout flow
* Automated unit, E2E and accessibility testing
* GitHub Actions CI/CD

### What is intentionally not included

| Limitation                 | Details                                                        |
| -------------------------- | -------------------------------------------------------------- |
| 🚫 **No Backend**          | Product data is static and there is no server-side application |
| 🔐 **Demo Authentication** | Accounts exist only in browser `localStorage`                  |
| 💳 **No Real Payments**    | Checkout does not charge money or send payment information     |
| 📦 **No Inventory System** | Stock and availability are not managed                         |
| 🚚 **No Shipping System**  | Shipping and tax calculations are outside the project scope    |
| 🗄️ **No Server Orders**   | Orders are demo-only and are not stored on a backend           |

> 🔒 Passwords in the demo authentication flow are stored as salted PBKDF2 hashes. This demonstrates the client-side flow, **not production-grade authentication**.

---

## 🚀 Getting Started

### Prerequisites

* **Node.js 24** recommended, matching the CI environment.

### Installation

```bash
npm install
```

### Start development

```bash
npm run dev
```

Then open the local Vite URL shown in the terminal.

### Useful commands

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the Vite development server        |
| `npm run build`        | Type-check and create a production build |
| `npm run preview`      | Preview the production build             |
| `npm run lint`         | Run ESLint                               |
| `npm run typecheck`    | Run TypeScript checks                    |
| `npm run format:check` | Check formatting with Prettier           |
| `npm run format`       | Format the project with Prettier         |
| `npm test`             | Run Vitest unit/component tests          |
| `npm run test:watch`   | Run Vitest in watch mode                 |
| `npm run test:e2e`     | Build and run Playwright E2E tests       |

For the first E2E run:

```bash
npx playwright install chromium
```

---

## 🧪 Testing

The project uses multiple testing layers rather than relying on a single test type.

| Layer           | Tool                           | Coverage                    |
| --------------- | ------------------------------ | --------------------------- |
| 🧩 Unit & UI    | Vitest + React Testing Library | `src/**/*.test.ts(x)`       |
| 🌐 End-to-End   | Playwright                     | `e2e/*.spec.ts`             |
| ♿ Accessibility | axe-core + Playwright          | `e2e/accessibility.spec.ts` |

### Current test suite

* **385** unit and component tests
* **33** test files
* **152** Playwright E2E tests
* **6** E2E test files

The E2E suite runs against the production build under the `/online-store/` base path, using the GitHub Pages `404.html` fallback for SPA routing.

Accessibility tests cover areas including:

* page language and direction
* form labels and validation errors
* keyboard navigation
* focus behavior
* mobile navigation
* main application states

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
├── lib/          Formatting, validation and password helpers
├── pages/        Route-level pages
├── services/     Product loading and validation
└── test/         Test setup and helpers

e2e/              Playwright specs and support code
public/            Static assets and product data
docs/              Design and testing documentation
scripts/           GitHub Pages build helpers
.github/           CI and deployment workflows
```

---

## 🔄 CI/CD

The repository uses **GitHub Actions** for automated verification and deployment.

### Continuous Integration

`ci.yml` runs on:

* Pull requests
* Pushes to `main`

The pipeline verifies:

* formatting
* linting
* TypeScript
* unit/component tests
* production build
* Playwright E2E tests

### Deployment

`deploy.yml` builds and deploys the application to **GitHub Pages** on pushes to `main`.

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

* 🧪 [`docs/testing.md`](docs/testing.md) — testing strategy, isolation, accessibility and CI
* 💾 [`docs/state-persistence.md`](docs/state-persistence.md) — cart and favorites persistence
* 🗃️ [`docs/product-data-migration.md`](docs/product-data-migration.md) — product data migration and cleanup

---

## 🕰️ Project History

The project originally started as a static **HTML/CSS/JavaScript** website.

It was later rebuilt using **React and TypeScript**, with the original implementation preserved in the [`legacy-v1`](https://github.com/Netanel1010/online-store/tree/legacy-v1) tag.

This repository therefore also documents the evolution from a simple static site into a modern component-based frontend application.

---

## 👨‍💻 Author

Built by [**Netanel1010**](https://github.com/Netanel1010) as part of Software Engineering studies.

---

<p align="center">   <strong>🛒 Built with React · TypeScript · and a lot of testing.</strong> </p>
