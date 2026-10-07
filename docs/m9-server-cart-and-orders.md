# M9: server cart and orders

M9 moved the cart and the checkout from a browser-only demo to the API. The accounts already lived
there (M2–M3). This page records what was built, the decisions behind it and how it was verified; the
details of each part are in the documents it links to.

## What was built

| Step | Pull request | What it added                                                                                                                                           |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M9.1 | #58          | Orders in the API: server-side pricing, an immutable snapshot, an idempotent `POST /api/orders`, order numbers, ownership, a limit, MongoDB indexes     |
| M9.2 | #59          | The checkout places the order through the API (one `Idempotency-Key` per attempt, reused by every retry) and the order page is read from the API        |
| M9.3 | #60          | "My orders": `GET /api/orders` and a page in the account menu                                                                                           |
| M9.4 | #61          | The cart API: one cart per account, ids and quantities only, compare-and-swap on a revision, limits shared with the order                               |
| M9.5 | #62          | Cart synchronization in the storefront: merge at sign-in, debounced sending, offline behavior, an empty cart after sign-out; CORS allows `PUT`/`DELETE` |
| M9.6 | this change  | Documentation brought up to date, dead test helpers removed, final verification                                                                         |

Where to read more: [the API](../server/README.md#cart) (cart and orders), [how the cart is kept in
step with the account](state-persistence.md#keeping-the-cart-in-the-account), [deployment](deployment.md#carts-and-orders-in-production)
and [the tests](testing.md#carts-orders-and-cart-synchronization-in-the-tests).

## Decisions

1. **It stays a demo.** Orders are real records, but nothing is charged, shipped or emailed. Order
   numbers keep the `DEMO-` prefix and the checkout says so. The name, phone and address of an order
   are stored with it; there is no way to delete an account or its orders yet.
2. **The server decides the money.** The client sends ids, quantities and the delivery details; the
   API prices the order from its own products. `expectedTotal` stops an order from costing something
   other than what was shown (`409 price_changed`), and a missing product is `409 product_unavailable`,
   never dropped silently.
3. **A retry never places a second order.** `Idempotency-Key` plus a unique `{ userId, idempotencyKey }`
   index. The browser keeps the key of an attempt in `localStorage` until the attempt ends.
4. **The cart stays in the browser and is mirrored.** The pages stay instant and work offline; a
   signed-in visitor's cart is also kept in the account. At sign-in a cart filled in while signed out
   is joined with the account's (the larger quantity, never the sum); signing out empties the cart in
   the browser (shared computers) and the account keeps it.
5. **A cart holds at most 50 different products**, the most an order can hold, so a cart is always one
   that can be ordered. This limit is new with the server cart and is documented as such.
6. **CORS** allows `GET`, `HEAD`, `POST`, `PUT` and `DELETE` (not `PATCH`) and the `Idempotency-Key`
   header; the M3 hardening check and its tests follow.
7. **The in-house rate limiter stays.** Placing an order (20 an hour) and changing a cart (300 in 15
   minutes) are limited per address like sign-in is. No new dependency was added.
8. **No transactions, queues, Redux or React Query.** An order and a cart are single documents, and
   the unique indexes and the revision are what keep them correct.

## Known limits

- Changes made on another device appear at the next sign-in or page load, not live; there is no sync
  between tabs.
- A change made in the last 400 ms before signing out is not sent.
- Favorites are per browser.
- An order cannot be cancelled or edited, and there is no stock, payment, shipping or email.
- The rate limits are in the memory of the API process, so they start again when the free Render
  service sleeps or restarts.
- CodeQL may report the missing rate limit on a route that is limited by the in-house limiter; it
  does not recognize it. Dismiss such an alert with that reason rather than adding a dependency.

## Final verification (M9.6)

| Check                                                               | Result                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `npm run lint`, `npm run typecheck`, `npm run format:check`         | clean                                                      |
| Site tests (`npm test`)                                             | 861 passed in 62 files                                     |
| API tests (`npm run test:server`)                                   | 1,018 passed, 88 integration tests skipped without MongoDB |
| End-to-end tests (`npm run test:e2e`)                               | 298 passed in 16 files                                     |
| `npm run build` and `npm run build:server`                          | pass                                                       |
| `STRICT_HARDENING=1 npm run check:api` against production           | passes, including the `PUT`/`DELETE` preflight             |
| `GET /api/cart` and `GET /api/orders` on production without a token | `401` both                                                 |
| MongoDB integration tests                                           | run by the CI `integration` job on every pull request      |
