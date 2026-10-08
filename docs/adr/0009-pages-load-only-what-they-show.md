# 0009. Pages load only the products they show, and `products.json` is the one source

**Status:** Accepted (M10)

## Context

Until M10 the site loaded the catalog as a whole and picked from it what a page needed: the cart, the
favorites, the home page sections, the category links and the search suggestions. That cost grows with
the catalog, and the catalog was available in two places the site could read (the API and a published
copy of `products.json`).

## Decision

- **No page reads the whole catalog.** Each asks the API for what it shows: the cart, favorites,
  checkout and orders `GET /api/products?ids=…` (at most 100 ids; an empty list is refused, so "no
  ids" is never read as "every product"); the home page `?sale=true` and `?recommended=true`; the
  category links `GET /api/categories`; the search box `?q=…&limit=5`, 150 ms after the typing
  pauses; a product page `GET /api/products/:id`; listings the paged query of
  [0008](0008-search-and-filtering-in-the-api.md).
- **The early catalog preload is gone**, because no one request is shared by all pages. The browser is
  still told to connect to the API early (`preconnect`).
- **`public/data/products.json` is the single source of the catalog.** `npm run seed:products` copies
  it to MongoDB (validated first, upsert by `id`, never deleting), the build writes the static SEO
  pages and the sitemap from it, and it is **not published** with the site.
- **`npm run check:api` compares the two** (the file, read through the same schema, against all the
  API's pages) and names products that are missing, extra or different. In the deploy job a
  difference is a warning, because the file is seeded after the merge; with `STRICT_HARDENING=1` it
  is an error.

## Consequences

- More, smaller requests, each with its own loading and error state; `ProductsBoundary` gives them one
  shape.
- Search suggestions are asynchronous: a visitor who presses Enter before they arrive searches instead
  of opening a suggestion.
- The cart page and `ShopStateReconciler` ask for the same ids when a page opens. That is known and
  accepted.
- A product changed only in MongoDB is not reflected in the static SEO pages until `products.json`
  is updated and the site rebuilt.
- The new API parameters must be live before the site that sends them
  ([deployment](../deployment.md#how-a-change-reaches-production)).

## In the code

`src/services/productService.ts`, `src/features/products/` (`useProductsByIds.ts`, `useHomeProducts.ts`,
`useCategoryCounts.ts`, `useProductSuggestions.ts`, `components/ProductsBoundary.tsx`),
`scripts/check-api.mjs`, `scripts/catalogDrift.mjs`, `scripts/static-routes.mjs`, `docs/seo.md`.
