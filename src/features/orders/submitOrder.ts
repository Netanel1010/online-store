import type { CartItem } from '@/features/cart/cartStore'
import type { CheckoutValues } from '@/features/checkout/schema'
import { forgetCheckoutAttempt, idempotencyKeyFor } from './checkoutAttempt'
import { placeOrder, type PlaceOrderOutcome } from './orderService'

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
 */
export async function submitOrder({
  token,
  userId,
  items,
  values,
  expectedTotal,
}: {
  token: string
  userId: string
  items: readonly CartItem[]
  values: CheckoutValues
  expectedTotal: number
}): Promise<PlaceOrderOutcome> {
  const delivery = deliveryOf(values)
  const idempotencyKey = idempotencyKeyFor(userId, items, delivery)

  const outcome = await placeOrder({ token, idempotencyKey, items, delivery, expectedTotal })

  if (outcome.ok || outcome.reason === 'key-reused') forgetCheckoutAttempt()
  return outcome
}
