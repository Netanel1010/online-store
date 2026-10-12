import type { CartItem } from '@/features/cart/cartStore'
import type { CheckoutValues } from '@/features/checkout/schema'
import { forgetCheckoutAttempt, idempotencyKeyFor } from './checkoutAttempt'
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

/** The order being sent right now, if any: a second click or key press joins it instead of sending. */
let inFlight: Promise<PlaceOrderOutcome> | null = null

/**
 * Places the order of the checkout. The key belongs to the account's unresolved attempt (see
 * `checkoutAttempt.ts`), so every request after an uncertain one (this call again, a reload, the
 * repeats inside `placeOrder`, an edit of the details) carries the same key and the API decides
 * whether an order already exists. The key is forgotten only once an order exists for the visitor.
 * A refusal, even `key-reused`, keeps it: the checkout has to show the order that exists first.
 *
 * While a request is on its way, a second call (a double click, Enter pressed twice) gets the same
 * answer instead of sending a second request.
 */
export function submitOrder(request: SubmitOrderRequest): Promise<PlaceOrderOutcome> {
  if (inFlight) return inFlight
  const attempt = send(request)
  inFlight = attempt
  const done = () => {
    if (inFlight === attempt) inFlight = null
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
  const outcome = await placeOrder({
    token,
    idempotencyKey,
    items,
    delivery: deliveryOf(values),
    expectedTotal,
  })

  // Only this account's attempt: another account's unresolved order is not resolved by this one.
  if (outcome.ok) forgetCheckoutAttempt(userId)
  return outcome
}
