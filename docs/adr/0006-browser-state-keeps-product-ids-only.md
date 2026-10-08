# 0006. Cart and favorites in the browser keep product ids, never copies of products

**Status:** Accepted

## Context

The first version of the site stored whole product objects in `localStorage`, so a price or image
change in the catalog never reached an existing cart.

## Decision

The persisted shape is ids and quantities only: `{ items: [{ productId, quantity }] }` for the cart and
`{ ids: [...] }` for the favorites. Names, images and prices are always read from the API when a page
renders, and totals are derived (`features/cart/summary.ts`), never stored. The cart in the API follows
the same rule ([0007](0007-local-first-cart-mirrored-to-the-account.md)).

What is read back from `localStorage` is untrusted: each store validates it with a Zod schema on
rehydrate and falls back to in-memory state when it is invalid; duplicate lines are merged and
quantities capped at 99.

## Consequences

- A cart can only ever show current prices, and what is stored is small and cheap to validate.
- A page that shows the cart or the favorites must ask the API for those ids
  (`useProductsByIds`, [0009](0009-pages-load-only-what-they-show.md)), so it has loading and error
  states like any other page.
- A stored id can outlive its product. `ShopStateReconciler` asks the API about the ids of both stores
  when the site opens (and again when the account's cart arrives) and removes those with no product.
- Version 1 of the stored shapes is in place, but there is no `migrate` function until a second
  version exists.

## In the code

`src/features/cart/cartStore.ts`, `src/features/favorites/favoritesStore.ts`,
`src/features/shop/ShopStateReconciler.tsx`, `docs/state-persistence.md`.
