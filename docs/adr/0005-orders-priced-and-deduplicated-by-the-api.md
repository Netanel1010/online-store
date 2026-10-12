# 0005. The API prices every order, keeps an immutable snapshot and makes a retry harmless

**Status:** Accepted (M9.1, M9.2); amended by the order reliability work: the key of an unresolved attempt, the order number in the `409`, and `POST /api/orders/lookup`

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
  `409 idempotency_key_reuse`, which names the account's own order in `details.orderNumber`. The
  browser keeps the key of an attempt in `localStorage` until the attempt ends and reuses it for
  every retry.
- **The key belongs to an unresolved attempt, not to what was typed.** After an answer is lost the
  visitor may edit the delivery details or the cart, and it is still the same attempt: the next request
  carries the same key, and the API, which knows whether it made an order, decides. If it made none,
  the edited request simply places the order, so no valid edit is lost. If it made one, the answer is
  the `409` with the order's number, the storefront shows that order, and nothing new is placed. An
  order cannot be edited, so the visitor is told that the details they changed were not applied.
  Tying the key to the details instead would mint a new key for every edit and place a second order.
- **Each account keeps its own unresolved attempt.** The browser keeps the attempts side by side, one
  per account (a digest of the account, never the account itself; at most ten, none older than a day).
  Another account signing in on the same browser does not take the key from the first: that order may
  still be made on the server, and coming back with a new key would place it twice. An account only
  sends, looks up and forgets its own key.
- **The key is let go only when the attempt is resolved:** an order exists for the visitor who is signed in (`200`/`201`), the visitor
  confirmed that they want a separate order besides the one that exists, or a day passed. A refusal
  such as `price_changed` or `product_unavailable` does not resolve it, because an earlier request
  that is still on its way could place the order afterwards.
- **`POST /api/orders/lookup`** answers "did this attempt make an order?" with the key in the body (never in
  an address or a log): `200` with the order, or `404 order_not_found`. The checkout asks when it opens
  with an unresolved attempt, so a reload shows the order that exists before anything is retyped.
  **Only an explicit `404` with `error.code` `order_not_found` means that no order exists.** Anything
  else (another status or code, an empty or unreadable body, a `404 not_found` from an API that does not
  have the route yet, a network failure) is "cannot verify": the key is kept, no separate order is
  offered, and the visitor is pointed to "My orders". An older API is therefore safe, and the API is
  deployed before the site.
- **Scope of an order:** it belongs to one account, and anyone else's order is the same
  `404 order_not_found` as one that does not exist. Order numbers look like `DEMO-7K2M9QX4`; the
  `DEMO-` prefix stays while nothing is paid. It stays a demo: nothing is charged, shipped or emailed.

## Consequences

- No transactions are used: an order is one document, and the unique indexes are what keep it correct
  (proved against a real MongoDB: the same request sent eight times at once makes one order).
- An order cannot be cancelled or edited, has one status (`placed`), and there is no stock. There is no
  way yet to delete an account or its orders, and orders hold the name, phone and address entered.
- Placing an order is limited to 20 an hour per address ([0010](0010-in-house-limits-and-headers.md)).
  Looking an attempt up is a read like the others: it needs a session and finds only the account's
  own orders.
- Two requests with one key and different content that arrive at the same moment make one order: the
  unique index decides, and the other is told which order exists (proved against a real MongoDB).
- While a request is on its way, a second submit of the same session (a double click, Enter twice)
  joins it instead of sending another. Another account never joins it.
- An answer that arrives after the visitor switched accounts is the earlier account's, and resolves
  nothing: it does not empty the new account's cart, move its page or sign it out, and the key of the
  account that sent it is **kept**, even for an order that was placed. That account has not seen the
  order, and the cart in its account still holds what it ordered (the browser cannot send the emptied
  cart once the session is gone). When it comes back, the checkout finds the order by its key and shows
  it, instead of letting it order the same cart again with a key of its own. The checkout page also
  starts afresh for each account, so one account's notice is never shown to the next.
- Choosing a separate order is the one way to place another order after an uncertain attempt, and it
  asks first. Reconciling the cart with an order that turned out to exist is a separate piece of work:
  until then the cart is left as it is.

## In the code

`server/src/orders/` (`service.ts`, `schemas.ts`, `routes.ts`, `repository.ts`, `orderNumber.ts`),
`src/features/orders/` (`submitOrder.ts`, `checkoutAttempt.ts`, `orderService.ts`, `OrderAttemptNotice.tsx`),
`src/pages/CheckoutPage.tsx`, `docs/m9-server-cart-and-orders.md`.
