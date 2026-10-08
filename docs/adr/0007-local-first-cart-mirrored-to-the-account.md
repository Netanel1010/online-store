# 0007. The cart lives in the browser and is mirrored to the account

**Status:** Accepted (M9.4, M9.5)

## Context

A cart that exists only in the browser is lost with the browser and cannot follow a visitor to another
device. A cart that exists only on the server makes every click wait for a host that may be asleep.

## Decision

- **The pages only read and change the cart in the browser**, so it is instant and works offline. For
  a signed-in visitor, a sync engine (`cartSync.ts`) mirrors it to `/api/cart`.
- **Sending:** about 400 ms after a change, as the quantities it ended at; only the lines that differ
  from what the browser last knew the API holds are sent, so a burst of clicks is one request and a
  line another device added is never touched. A failed send is repeated after 5, 15 and then every 45
  seconds, and at once when the browser is back online.
- **Sign-in** reconciles the two copies using a marker `{ owner, dirty }` (`online-store:cart-sync`):
  a cart filled in while signed out is **joined** with the account's (the larger quantity, never the
  sum); a copy of this account's cart with unsent changes is **sent**; a clean copy, or one left by
  another account, is **replaced** by the account's.
- **Sign-out** empties the cart in the browser (shared computers) and forgets the marker; the account
  keeps its cart.
- **The API's cart** is one document per account holding ids and quantities only, with a `revision`.
  A change reads the cart, computes the new lines and writes them only if the cart is still at that
  revision (a compare-and-swap in one atomic update), retrying up to five times, then
  `409 cart_conflict`. Two tabs changing it at once are both applied.
- **A cart holds at most 50 different products**, the most an order can hold, so a cart is always one
  that can be ordered.
- Not used: transactions, queues, Redux or React Query (an order and a cart are single documents).

## Consequences

- Changes made on another device appear at the next sign-in or page load, not live; there is no sync
  between tabs; a change made in the last 400 ms before signing out is not sent.
- A product the API refuses (it left the catalog) is removed from the cart with a message, because it
  would otherwise be sent again for ever.
- Changing a cart is limited to 300 changes per 15 minutes per address.

## In the code

`src/features/cart/` (`cartSync.ts`, `cartSyncPlan.ts`, `cartSyncMarker.ts`),
`server/src/cart/` (`service.ts`, `repository.ts`), `docs/state-persistence.md`,
`docs/m9-server-cart-and-orders.md`.
