# 0005. The API prices every order, keeps an immutable snapshot and makes a retry harmless

**Status:** Accepted (M9.1, M9.2)

## Context

The checkout is a demo, but the orders are real records in an account. A browser can be edited, so
nothing it says about money can be believed. The API also runs on a host that may be asleep: a
request that times out may well have succeeded, and the browser repeats it.

## Decision

- **The server decides the money.** The client sends only product ids, quantities, the delivery
  details and `expectedTotal`. The API reads its own products and works out every unit price, the
  total, the total before the sale and the savings (whole shekels). A price, a name or a total in the
  body is not read.
- **`expectedTotal` guards what the visitor saw.** If it is not what the server works out, nothing is
  ordered: `409 price_changed`, with the real total in `details`. A missing product is
  `409 product_unavailable` with `details.productIds`; nothing is dropped silently.
- **An immutable snapshot.** The order stores each line's name and price as they were, so a later
  change to the catalog changes no order.
- **A retry never places a second order.** `POST /api/orders` requires an `Idempotency-Key`
  (16–128 characters), stored with the order and a digest of what was ordered under a unique
  `{ userId, idempotencyKey }` index. The same key with the same request returns the order it made
  (`200`, not `201`) even if prices changed since; the same key with a different request is
  `409 idempotency_key_reuse`. The browser keeps the key of an attempt in `localStorage` until the
  attempt ends and reuses it for every retry.
- **Scope of an order:** it belongs to one account, and anyone else's order is the same
  `404 order_not_found` as one that does not exist. Order numbers look like `DEMO-7K2M9QX4`; the
  `DEMO-` prefix stays while nothing is paid. It stays a demo: nothing is charged, shipped or emailed.

## Consequences

- No transactions are used: an order is one document, and the unique indexes are what keep it correct
  (proved against a real MongoDB: the same request sent eight times at once makes one order).
- An order cannot be cancelled or edited, has one status (`placed`), and there is no stock. There is no
  way yet to delete an account or its orders, and orders hold the name, phone and address entered.
- Placing an order is limited to 20 an hour per address ([0010](0010-in-house-limits-and-headers.md)).

## In the code

`server/src/orders/` (`service.ts`, `schemas.ts`, `repository.ts`, `orderNumber.ts`),
`src/features/orders/` (`submitOrder.ts`, `checkoutAttempt.ts`), `docs/m9-server-cart-and-orders.md`.
