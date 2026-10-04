# Cart and favorites state

Cart and favorites live in two small Zustand stores (`features/cart/cartStore.ts`,
`features/favorites/favoritesStore.ts`) that persist to `localStorage` with the `persist`
middleware.

## Decision: persist product IDs only, never product copies

| Store     | Key                      | Persisted shape                        |
| --------- | ------------------------ | -------------------------------------- |
| Cart      | `online-store:cart`      | `{ items: [{ productId, quantity }] }` |
| Favorites | `online-store:favorites` | `{ ids: [productId, ...] }`            |

Both use `version: 1`.

**Why**

- **No stale data.** The legacy site stored whole product objects in `localStorage`, so a price
  or image change in `products.json` never reached existing carts. Names, images and prices are
  now always read from the catalog when rendering, so a cart can only show current prices.
- **Small and cheap to validate.** An id and an integer is all there is to check.
- **One source of truth.** The catalog service owns product data; the stores own only what the
  visitor chose.

**Consequences**

- Screens that show cart or favorites need the catalog loaded. They use `CatalogBoundary`, so
  they get the same loading and error states as the rest of the app.
- A stored id can outlive its product. Once the catalog loads, `ShopStateReconciler` removes
  unknown ids from both stores, so badges and pages never count products that cannot be shown.
- Totals are derived (`features/cart/summary.ts`), not stored.

## Stored data is untrusted

`localStorage` can be edited, corrupted or written by an older version. On rehydrate each
store validates what it finds with a Zod schema and falls back to the in-memory state if the
data is invalid (negative, fractional or oversized quantities, wrong types, empty ids, not an
array, ...). Duplicate lines are merged and quantities capped at `MAX_QUANTITY` (99). If
`localStorage` is unavailable, the stores keep working in memory.

## Not handled (yet)

- **Cross-tab sync:** a change in one tab shows in another after a reload, not live.
- **Per-user carts:** state is per browser. Associating it with an account belongs to the
  authentication milestone.
- **Schema migrations:** `version: 1` is in place, but no `migrate` function exists until a
  second version does.
