import type { CartItem } from '@/features/cart/cartStore'
import type { CheckoutValues } from '@/features/checkout/schema'
import { idempotencyKeyFor } from './checkoutAttempt'
import { placeOrder, type PlaceOrderOutcome } from './orderService'

/** The part of the checkout form that is an order's delivery details (not the demo tick box). */
function deliveryOf(values: CheckoutValues) {
  const { fullName, email, phone, city, street, houseNumber, apartment, postalCode, notes } = values
  return { fullName, email, phone, city, street, houseNumber, apartment, postalCode, notes }
}

interface SubmitOrderRequest {
  token: string
  userId: string
  items: readonly CartItem[]
  values: CheckoutValues
  expectedTotal: number
}

/**
 * The orders being sent right now, by the session that sent them: a second click or key press of the
 * same session joins its request instead of sending another. Another account (or the same account
 * signed in again) never joins it: its answer is that account's, and must not be taken for another's.
 */
const inFlight = new Map<string, Promise<PlaceOrderOutcome>>()

/**
 * Places the order of the checkout. The key belongs to the account's unresolved attempt (see
 * `checkoutAttempt.ts`), so every request after an uncertain one (this call again, a reload, the
 * repeats inside `placeOrder`, an edit of the details) carries the same key and the API decides
 * whether an order already exists. The key is kept whatever the answer is, even an order that was
 * placed or `key-reused`: the caller forgets it once the order is the signed-in visitor's own, and
 * the checkout has to show the order that exists first.
 *
 * While a request is on its way, a second call of the same session (a double click, Enter pressed
 * twice) gets the same answer instead of sending a second request.
 */
export function submitOrder(request: SubmitOrderRequest): Promise<PlaceOrderOutcome> {
  // An account id and a token are made of letters, digits and dashes: "|" cannot blur the two.
  const session = `${request.userId}|${request.token}`
  const joined = inFlight.get(session)
  if (joined) return joined
  const attempt = send(request)
  inFlight.set(session, attempt)
  const done = () => {
    if (inFlight.get(session) === attempt) inFlight.delete(session)
  }
  attempt.then(done, done)
  return attempt
}

async function send({
  token,
  userId,
  items,
  values,
  expectedTotal,
}: SubmitOrderRequest): Promise<PlaceOrderOutcome> {
  const idempotencyKey = idempotencyKeyFor(userId)
  // The attempt is not resolved here, not even by an order that exists: only the caller knows whether
  // the visitor who is signed in now is the one who sent it (see `forgetCheckoutAttempt`). If they
  // switched accounts meanwhile, the order exists but they have not seen it, so its key must stay,
  // to be found when that account comes back.
  return placeOrder({
    token,
    idempotencyKey,
    items,
    delivery: deliveryOf(values),
    expectedTotal,
  })
}
