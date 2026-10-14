# Cart and favorites state

Cart and favorites live in two small Zustand stores (`features/cart/cartStore.ts`,
`features/favorites/favoritesStore.ts`) that persist to `localStorage` with the `persist`
middleware. The favorites stay in the browser. The cart is also kept in the visitor's account when
they are signed in: [Keeping the cart in the account](#keeping-the-cart-in-the-account) says how.

## Decision: persist product IDs only, never product copies

| Store     | Key                      | Persisted shape                        |
| --------- | ------------------------ | -------------------------------------- |
| Cart      | `online-store:cart`      | `{ items: [{ productId, quantity }] }` |
| Favorites | `online-store:favorites` | `{ ids: [productId, ...] }`            |

Both use `version: 1`. The cart has a third small key, `online-store:cart-sync`, described below.

**Why**

- **No stale data.** The legacy site stored whole product objects in `localStorage`, so a price
  or image change in `products.json` never reached existing carts. Names, images and prices are
  now always read from the catalog when rendering, so a cart can only show current prices. The
  cart in the API follows the same rule: it holds product ids and quantities and nothing else.
- **Small and cheap to validate.** An id and an integer is all there is to check.
- **One source of truth.** The catalog service owns product data; the stores own only what the
  visitor chose.

**Consequences**

- Screens that show cart or favorites ask the API for the products with the ids in the store
  (`useProductsByIds`, `ProductsBoundary`), not for the whole catalog, so they get the same loading
  and error states as the rest of the app. A store with no ids asks for nothing.
- A stored id can outlive its product. When the site opens, and again once the account's cart has
  arrived, `ShopStateReconciler` asks the API about the ids of both stores and removes the ones it has
  no product for, so badges and pages never count products that cannot be shown. What is added later
  was just shown by the API, so it is not asked about again. For a signed-in visitor the removal is
  sent to the account like any other change.
- Totals are derived (`features/cart/summary.ts`), not stored.

## Stored data is untrusted

`localStorage` can be edited, corrupted or written by an older version. On rehydrate each
store validates what it finds with a Zod schema and falls back to the in-memory state if the
data is invalid (negative, fractional or oversized quantities, wrong types, empty ids, not an
array, ...). Duplicate lines are merged and quantities capped at `MAX_QUANTITY` (99). If
`localStorage` is unavailable, the stores keep working in memory. The sync marker is read the same
way: anything that does not match the schema counts as no marker.

## Keeping the cart in the account

The pages only ever read and change the cart in the browser, so it is instant and works offline.
For a signed-in visitor, `features/cart/cartSync.ts` mirrors it to the cart API (`/api/cart`). It is
started once by `KeepCartSynced` in the root layout, and talks to the API through `cartService.ts`.

**The marker.** `online-store:cart-sync` holds `{ owner, dirty }`: the id of the account whose cart
the copy in the browser is, and whether it has changes the API has not been given yet. Nothing
about the products is in it. It is how a sign-in knows what the cart it finds in the browser is.

**Signing in** (or loading the site with a stored session). The account's cart is read first, then
the cart in the browser becomes one of these, depending on the marker:

| The cart in the browser is…                                     | What happens                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Filled in while signed out (no marker)                          | **Joined** with the account's: every product, and for a product in both the larger quantity, never the sum  |
| A copy of this account's cart, with changes not sent yet        | **Sent**: it is what the visitor last wanted, so a line they removed (or an order that emptied it) stays so |
| A copy of this account's cart, all sent                         | **Replaced** by the account's, so a change made on another device shows up                                  |
| Left by another account (a shared computer, an expired session) | **Replaced** by the account's: one account's cart is never handed to another                                |

**While signed in.** Every change is sent about 400 ms later, as the quantities it ended at: a burst
of clicks is one request, and only the lines that differ from what the browser last knew the API
holds are sent (`PUT /api/cart/items/:productId`, `DELETE /api/cart/items/:productId`, or one
`DELETE /api/cart` when the cart was emptied). Every one of these can be repeated safely, so they use
`fetchWithRetry` and survive a host that is waking up. A line that another device added is not known
here and is never touched.

- **When the API cannot be reached** the cart in the browser keeps working. The attempt is repeated
  after 5, 15 and then every 45 seconds, and at once when the browser says it is online again. The
  visitor is told once per outage, with a toast.
- **A product the API refuses** (it left the catalog) or that does not fit in a full cart (50
  different products, the most an order can hold) is taken out of the cart, with a message, because
  otherwise it would be sent again for ever.
- **When the API no longer knows the session** (401) nothing more is sent and the cart in the browser
  is left as it is.
- **Until the account's cart has arrived** an empty cart on the cart and checkout pages shows
  "loading", not "the cart is empty" (`cartSyncStatus.ts`). A cart that already has lines never waits.

**Signing out** empties the cart in the browser and forgets the marker, so that the next person on a
shared computer does not find it. The account keeps its cart, and it comes back at the next sign-in,
here or on another device. The favorites are not touched. Placing an order empties the cart like any
other change, so the account's cart is emptied too.

## Several tabs

Tabs of one browser share the `localStorage` and nothing else: each has its own copy of the cart in
memory. The cart in storage is what they have in common, so it is what a change starts from and what
a tab takes when another tab changes it. (`cartStore.ts`, `cartTabSync.ts`)

- **A change starts from storage.** `addItem`, `setQuantity`, `removeItem` and `retainOnly` first read
  the cart kept in the browser (`readStoredCart`, validated like anything else from storage) and apply
  the change to that, so a tab that was open before another tab's change does not write its old copy
  over it. When storage has nothing usable (nothing stored, not JSON, not a cart, blocked) the cart of
  the tab is used, as before.
- **A change from another tab is taken at once.** `startCartTabSync`, started by `KeepCartSynced`,
  listens to the `storage` event of the cart's key (localStorage only) and takes the cart. A tab that
  was hidden, frozen or restored from the back-forward cache may have missed events, so it also reads
  the cart when it is shown (`visibilitychange`, `pageshow`). What is taken is written back unchanged,
  which the browser does not announce, so tabs do not answer one another in a loop. Each tab still
  sends the cart to the account itself; the requests are the same in every tab and can be repeated
  safely.
- **The checkout goes by the latest cart.** Just before it sends an order the checkout takes the cart
  the browser keeps (`takeCartNow`). If that differs from what the page was showing, the page shows it
  and nothing is sent, so an order is never placed from a cart that was not on the screen, and a tab
  whose cart was emptied by an order placed in another tab cannot place it again. What the visitor was
  told about the order (a changed price, a product that is gone) and the total they agreed to are
  dropped when the cart changes. Prices stay the API's: the total the page sends is only what it shows.
- **What the visitor is told.** On the cart and the checkout, and only when a change from another tab
  was actually taken: "העגלה עודכנה מלשונית אחרת." (once per run of changes, again after three
  seconds). Nothing is said on other pages, for a change made in the same tab, or when the other tab
  saved the cart this tab already has.

**The policy for two changes to one line is last write wins, and it is not a transaction.** A change
is a read of storage followed by a write. A change that another tab writes in the instant between the
two is overwritten, and when two tabs set the same line at the same moment the later write stays. This
makes the window as short as a read and a write; it does not close it. Closing it would take a lock
across tabs (the Web Locks API) or one tab that owns the cart, and the shop's carts are small and
changed by one person, so that was not done. A test (`cartStore.test.ts`, "is a read followed by a
write, not a transaction") pins this on purpose.

Tested in `src/features/cart/cartStore.test.ts`, `cartTabSync.test.ts`, `KeepCartSynced.test.tsx`,
`src/pages/checkout.test.tsx` ("the checkout goes by the latest cart") and, with two tabs of a real
browser sharing one storage, `e2e/cart-tabs.spec.ts`.

## Not handled (yet)

- **Signing out in one tab does not sign out the others.** The token is removed from storage, but a
  tab that was open keeps its session in memory until the API refuses it. That tab can still change the
  cart, and a change it makes is written to storage, so the cart of an account that signed out in another
  tab can be left in a browser that nobody is signed in to. Signing out and in across tabs belongs with
  the rest of the authentication and browser security, not with the cart.
- **Favorites across tabs:** the favorites are not followed between tabs; a change shows in another tab
  after a reload.
- **Two orders started in the same instant in two tabs:** the key of an attempt is made by the first
  tab that asks and read by the second, but two tabs that ask within the same few milliseconds can each
  make one. Order idempotency was not changed here.
- **Live sync between devices:** a change made on another device is read at the next sign-in or page
  load, not pushed.
- **Unsent changes at sign-out:** a change made in the last moment before signing out (inside the
  400 ms wait) is not sent, because the request that ends the session is sent at the same instant.
- **Per-user favorites:** favorites are per browser, whoever is signed in.
- **Schema migrations:** `version: 1` is in place, but no `migrate` function exists until a
  second version does.
