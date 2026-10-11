import type { CartItem } from '@/features/cart/cartStore'
import type { CheckoutValues } from '@/features/checkout/schema'
import {
  fingerprintOf,
  forgetCheckoutAttempt,
  idempotencyKeyFor,
  markAttemptPending,
  markAttemptSettled,
  readPendingAttempt,
} from './checkoutAttempt'
import type { Order } from './orderSchema'
import { lookupOrderByKey, placeOrder, type PlaceOrderOutcome } from './orderService'

/**
 * How long after a request was last sent (or its answer lost) the API may still be finishing it. The
 * API gives a request 25 s and a database call it started can finish just after that, so for this
 * long "there is no order with that key" does not yet mean "there will not be one". An object that
 * tests change (src/test/setup.ts), like `fetchPolicy`; nothing else in the app does.
 */
export const checkoutRecoveryPolicy = { settleMs: 30_000 }

/** What the checkout learns from a submission, beyond what the API said about the order itself. */
export type SubmitOutcome =
  | PlaceOrderOutcome
  /**
   * An earlier request of the visitor, whose answer was lost, did place an order, and the visitor then
   * changed something. That order is the answer: nothing new was sent, and what was changed since is
   * not in it (an order cannot be edited).
   */
  | { ok: true; order: Order; recovered: true }
  /** The API may still be finishing the earlier request: nothing was sent, try again in a moment. */
  | { ok: false; reason: 'still-checking' }
  /** It could not be found out whether the earlier request placed an order: nothing was sent. */
  | { ok: false; reason: 'cannot-verify' }

/** The part of the checkout form that is an order's delivery details (not the demo tick box). */
function deliveryOf(values: CheckoutValues) {
  const { fullName, email, phone, city, street, houseNumber, apartment, postalCode, notes } = values
  return { fullName, email, phone, city, street, houseNumber, apartment, postalCode, notes }
}

/**
 * Places the order of the checkout. The key of the attempt is kept for as long as the same order is
 * being tried, so every retry (this call again after a failure, a reload, the repeats inside
 * `placeOrder`) is the same order to the API, and it is forgotten once the order exists or the API
 * says the key cannot be used.
 *
 * The key belongs to what is ordered, so a visitor who corrects a detail after a request whose answer
 * was lost would get a new key, and with it a second order if the first one did exist. So a request
 * that is not the same as an earlier one whose outcome is not known is not sent first: the API is
 * asked about the earlier key. If that order exists it is the answer; if it does not (and the API can
 * no longer be finishing it) the new request goes ahead; if that cannot be told, nothing is sent.
 */
export async function submitOrder({
  token,
  userId,
  items,
  values,
  expectedTotal,
  clock = Date.now,
}: {
  token: string
  userId: string
  items: readonly CartItem[]
  values: CheckoutValues
  expectedTotal: number
  /** The time, read when the submission starts and again when an answer is lost (tests supply one). */
  clock?: () => number
}): Promise<SubmitOutcome> {
  const delivery = deliveryOf(values)
  const now = clock()

  const pending = readPendingAttempt(now)
  if (pending && pending.fingerprint !== fingerprintOf(userId, items, delivery)) {
    const lookup = await lookupOrderByKey(token, pending.key)
    if (lookup.status === 'ok') {
      forgetCheckoutAttempt()
      return { ok: true, order: lookup.order, recovered: true }
    }
    if (lookup.status === 'unauthorized') return { ok: false, reason: 'unauthorized' }
    if (lookup.status === 'unavailable') return { ok: false, reason: 'cannot-verify' }
    // No order with that key. It may still be on its way, though: not before the API is done with it.
    if (now - pending.since < checkoutRecoveryPolicy.settleMs) {
      return { ok: false, reason: 'still-checking' }
    }
    forgetCheckoutAttempt()
  }

  const idempotencyKey = idempotencyKeyFor(userId, items, delivery, now)
  // Written before the request goes out: if the page is reloaded or left while it is on its way, the
  // next visit still knows that an order with this key may exist.
  markAttemptPending(now)

  const outcome = await placeOrder({ token, idempotencyKey, items, delivery, expectedTotal })

  if (outcome.ok || outcome.reason === 'key-reused') forgetCheckoutAttempt()
  // No answer, or one that says nothing about the order: it may exist, and the API may still be at it.
  else if (outcome.reason === 'unavailable') markAttemptPending(clock())
  // The API said it made no order (a refusal, a limit, an ended session): nothing is pending.
  else markAttemptSettled()
  return outcome
}
