import { z } from 'zod'
import type { CartItem } from '@/features/cart/cartStore'
import type { DeliveryDetails } from '@/features/checkout/delivery'
import { apiUrl } from '@/lib/api'
import { fetchWithRetry } from '@/lib/fetchWithRetry'
import { orderSchema, type Order } from './orderSchema'

/** Why an order was not placed, in the terms the checkout cares about. */
export type PlaceOrderFailure =
  /** The API does not know the session (any more): the visitor has to sign in again. */
  | { reason: 'unauthorized' }
  /** These products are not in the catalog (any more). Nothing was ordered. */
  | { reason: 'product-unavailable'; productIds: string[] }
  /** The total is not what the visitor was shown; `total` is what it is now. Nothing was ordered. */
  | { reason: 'price-changed'; total: number }
  /** The idempotency key was used for a different order (the checkout starts a new key). */
  | { reason: 'key-reused' }
  /** The API refused what was sent (the form checks it first, so this is rare). */
  | { reason: 'invalid-input' }
  | { reason: 'too-many-requests' }
  /**
   * The API could not be reached, took too long, failed, or answered with something unexpected.
   * The order may or may not exist: sending it again with the same key is safe either way.
   */
  | { reason: 'unavailable' }

export type PlaceOrderOutcome = { ok: true; order: Order } | ({ ok: false } & PlaceOrderFailure)

const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
})
const productIdsSchema = z.array(z.string().min(1)).min(1)

export interface PlaceOrderRequest {
  token: string
  /** One per checkout attempt, and the same for every retry of it (see `checkoutAttempt.ts`). */
  idempotencyKey: string
  items: readonly CartItem[]
  delivery: DeliveryDetails
  /** The total the visitor was shown: the API refuses the order if it is not what it works out. */
  expectedTotal: number
}

/**
 * Places an order. Only ids and quantities are sent: the API prices the order from its own
 * products. The request is repeated when the API cannot be reached (a host that is waking up), with
 * the same `Idempotency-Key`, so a repeat can never make a second order.
 */
export async function placeOrder(
  { token, idempotencyKey, items, delivery, expectedTotal }: PlaceOrderRequest,
  signal?: AbortSignal,
): Promise<PlaceOrderOutcome> {
  let response: Response
  try {
    response = await fetchWithRetry(apiUrl('/api/orders'), signal, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        items: items.map(({ productId, quantity }) => ({ productId, quantity })),
        delivery,
        expectedTotal,
      }),
    })
  } catch {
    return { ok: false, reason: 'unavailable' }
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.status === 200 || response.status === 201) {
    // 200 is the same order given again to a retry: for the visitor it is the same success.
    const parsed = orderSchema.safeParse(body)
    return parsed.success ? { ok: true, order: parsed.data } : { ok: false, reason: 'unavailable' }
  }
  if (response.status === 401) return { ok: false, reason: 'unauthorized' }
  if (response.status === 400) return { ok: false, reason: 'invalid-input' }
  if (response.status === 429) return { ok: false, reason: 'too-many-requests' }
  if (response.status === 409) return readConflict(body)
  return { ok: false, reason: 'unavailable' }
}

function readConflict(body: unknown): PlaceOrderOutcome {
  const parsed = errorBodySchema.safeParse(body)
  if (!parsed.success) return { ok: false, reason: 'unavailable' }
  const { code, details } = parsed.data.error

  if (code === 'product_unavailable') {
    const productIds = productIdsSchema.safeParse(details?.productIds)
    if (productIds.success) {
      return { ok: false, reason: 'product-unavailable', productIds: productIds.data }
    }
  }
  if (code === 'price_changed') {
    const total = z.number().int().nonnegative().safeParse(details?.total)
    if (total.success) return { ok: false, reason: 'price-changed', total: total.data }
  }
  if (code === 'idempotency_key_reuse') return { ok: false, reason: 'key-reused' }
  return { ok: false, reason: 'unavailable' }
}

export type FetchOrderOutcome =
  | { status: 'ok'; order: Order }
  /** No such order in this account: it does not exist, or it is somebody else's. */
  | { status: 'not-found' }
  | { status: 'unauthorized' }
  | { status: 'unavailable' }

/** Reads one of the signed-in account's orders. A read, so it is repeated like the catalog is. */
export async function fetchOrder(
  token: string,
  orderNumber: string,
  signal?: AbortSignal,
): Promise<FetchOrderOutcome> {
  let response: Response
  try {
    response = await fetchWithRetry(
      apiUrl(`/api/orders/${encodeURIComponent(orderNumber)}`),
      signal,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    )
  } catch (error) {
    // The page was left: nobody is waiting for an answer.
    if (signal?.aborted) throw error
    return { status: 'unavailable' }
  }
  if (response.status === 404) return { status: 'not-found' }
  if (response.status === 401) return { status: 'unauthorized' }
  if (!response.ok) return { status: 'unavailable' }
  const parsed = orderSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? { status: 'ok', order: parsed.data } : { status: 'unavailable' }
}
