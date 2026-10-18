import { z } from 'zod'
import type { CartItem } from '@/features/cart/cartStore'
import type { DeliveryDetails } from '@/features/checkout/delivery'
import { apiUrl } from '@/lib/api'
import { fetchWithRetry } from '@/lib/fetchWithRetry'
import { orderPageSchema, orderSchema, type Order, type OrderPage } from './orderSchema'
import type { PaymentScenario } from './payment'

/** Why an order was not placed, in the terms the checkout cares about. */
export type PlaceOrderFailure =
  /** The API does not know the session (any more): the visitor has to sign in again. */
  | { reason: 'unauthorized' }
  /** These products are not in the catalog (any more). Nothing was ordered. */
  | { reason: 'product-unavailable'; productIds: string[] }
  /** The total is not what the visitor was shown; `total` is what it is now. Nothing was ordered. */
  | { reason: 'price-changed'; total: number }
  /**
   * The key already made an order, from a different request (the details were edited after an answer
   * was lost). Nothing new was ordered. `orderNumber` is that order, when the API says which it is;
   * an older API does not, and the visitor is sent to the list of their orders instead.
   */
  | { reason: 'key-reused'; orderNumber?: string }
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
/** What an order number looks like (the API's `DEMO-` and eight characters): it goes into an address. */
const orderNumberSchema = z.string().regex(/^DEMO-[0-9A-Z]{8}$/)

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
  if (code === 'idempotency_key_reuse') {
    const orderNumber = orderNumberSchema.safeParse(details?.orderNumber)
    return orderNumber.success
      ? { ok: false, reason: 'key-reused', orderNumber: orderNumber.data }
      : { ok: false, reason: 'key-reused' }
  }
  return { ok: false, reason: 'unavailable' }
}

/**
 * What asking about an attempt found. Only `none` means that the attempt made no order, and only an
 * explicit `404 order_not_found` from the API is `none`. Every other answer that is not an order
 * (another status or code, an unreadable or empty body, a route the API does not have, a network
 * failure) is `unverified`: nothing is known, and the checkout must not act as if no order exists.
 */
export type LookupOrderOutcome =
  | { status: 'found'; order: Order }
  | { status: 'none' }
  | { status: 'unauthorized' }
  | { status: 'unverified' }

/**
 * Asks the API whether an attempt (an Idempotency-Key) made an order. The key goes in the body, never
 * in the address. It only reads, so it is repeated like the other reads when the host is waking up.
 */
export async function lookupOrder(
  token: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<LookupOrderOutcome> {
  let response: Response
  try {
    response = await fetchWithRetry(apiUrl('/api/orders/lookup'), signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ idempotencyKey }),
    })
  } catch (error) {
    // The page was left: nobody is waiting for an answer.
    if (signal?.aborted) throw error
    return { status: 'unverified' }
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.status === 200) {
    const parsed = orderSchema.safeParse(body)
    return parsed.success ? { status: 'found', order: parsed.data } : { status: 'unverified' }
  }
  if (response.status === 401) return { status: 'unauthorized' }
  if (response.status === 404) {
    const parsed = errorBodySchema.safeParse(body)
    return parsed.success && parsed.data.error.code === 'order_not_found'
      ? { status: 'none' }
      : { status: 'unverified' }
  }
  return { status: 'unverified' }
}

export type FetchOrderOutcome =
  /** `requestId` is the API's `X-Request-Id`, for a report of an answer that cannot be right. */
  | { status: 'ok'; order: Order; requestId?: string }
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
  return parsed.success
    ? { status: 'ok', order: parsed.data, ...requestIdOf(response) }
    : { status: 'unavailable' }
}

const requestIdOf = (response: Response) => {
  const requestId = response.headers.get('X-Request-Id')
  return requestId ? { requestId } : {}
}

/** What a payment command came to, in the terms the order page cares about. */
export type PaymentCommandOutcome =
  | { ok: true; order: Order; requestId?: string }
  | {
      ok: false
      /**
       * `conflict`: the payment is not what the page thought (another tab, the provider decided, the
       * time is up): read the order again. `unavailable`: no answer, or one that did not confirm the
       * change; the order may have changed, so read it again, and a repeat with the same key is safe.
       */
      reason: 'unauthorized' | 'not-found' | 'conflict' | 'too-many-requests' | 'unavailable'
    }

async function paymentCommand(
  token: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown },
  signal?: AbortSignal,
): Promise<PaymentCommandOutcome> {
  let response: Response
  try {
    // Every one of these may be repeated: a start carries its Idempotency-Key, and cancelling or
    // refunding again is the same cancellation or refund.
    response = await fetchWithRetry(apiUrl(path), signal, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      body: JSON.stringify(init.body ?? {}),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    return { ok: false, reason: 'unavailable' }
  }
  if (response.status === 200 || response.status === 201) {
    const parsed = orderSchema.safeParse(await response.json().catch(() => null))
    return parsed.success
      ? { ok: true, order: parsed.data, ...requestIdOf(response) }
      : { ok: false, reason: 'unavailable' }
  }
  if (response.status === 401) return { ok: false, reason: 'unauthorized' }
  if (response.status === 404) return { ok: false, reason: 'not-found' }
  if (response.status === 409) return { ok: false, reason: 'conflict' }
  if (response.status === 429) return { ok: false, reason: 'too-many-requests' }
  return { ok: false, reason: 'unavailable' }
}

const orderPath = (orderNumber: string) => `/api/orders/${encodeURIComponent(orderNumber)}`

/**
 * Starts a simulated payment: only the scenario is sent, never a status or an outcome. The key is the
 * attempt's, and the same for every repeat of it.
 */
export function startPayment(
  token: string,
  orderNumber: string,
  idempotencyKey: string,
  scenario: PaymentScenario,
  signal?: AbortSignal,
): Promise<PaymentCommandOutcome> {
  return paymentCommand(
    token,
    `${orderPath(orderNumber)}/payment/attempts`,
    { headers: { 'Idempotency-Key': idempotencyKey }, body: { scenario } },
    signal,
  )
}

export function cancelPaymentAttempt(
  token: string,
  orderNumber: string,
  attemptNumber: number,
  signal?: AbortSignal,
): Promise<PaymentCommandOutcome> {
  return paymentCommand(
    token,
    `${orderPath(orderNumber)}/payment/attempts/${attemptNumber}/cancel`,
    {},
    signal,
  )
}

export function refundPayment(
  token: string,
  orderNumber: string,
  signal?: AbortSignal,
): Promise<PaymentCommandOutcome> {
  return paymentCommand(token, `${orderPath(orderNumber)}/payment/refund`, {}, signal)
}

export type FetchOrdersOutcome =
  { status: 'ok'; page: OrderPage } | { status: 'unauthorized' } | { status: 'unavailable' }

/** One page of the signed-in account's orders, the newest first, as the API orders them. */
export async function fetchOrders(
  token: string,
  page: number,
  signal?: AbortSignal,
): Promise<FetchOrdersOutcome> {
  let response: Response
  try {
    response = await fetchWithRetry(apiUrl(`/api/orders?page=${page}`), signal, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (error) {
    // The page was left: nobody is waiting for an answer.
    if (signal?.aborted) throw error
    return { status: 'unavailable' }
  }
  if (response.status === 401) return { status: 'unauthorized' }
  if (!response.ok) return { status: 'unavailable' }
  const parsed = orderPageSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? { status: 'ok', page: parsed.data } : { status: 'unavailable' }
}
