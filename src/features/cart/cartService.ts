import { z } from 'zod'
import { apiUrl } from '@/lib/api'
import { fetchWithRetry } from '@/lib/fetchWithRetry'
import { MAX_QUANTITY } from './limits.ts'

/** One line of the cart on the server: which product and how many, and nothing else. */
export interface ServerCartLine {
  productId: string
  quantity: number
}

/** Why the API did not do what was asked, in the terms the synchronization cares about. */
export type CartFailure =
  /** The API does not know the session (any more). */
  | { reason: 'unauthorized' }
  /** The product is not in the catalog (any more), or the id is not one: it can never be saved. */
  | { reason: 'rejected' }
  /** The cart already holds the most different products it may. */
  | { reason: 'cart-full' }
  /**
   * The API could not be reached, took too long, failed, was busy or answered with something
   * unexpected. Nothing is known to have changed, and asking again later is safe: every request
   * here sets a quantity or removes a line, so doing it twice is the same as doing it once.
   */
  | { reason: 'unavailable' }

/** The cart as the API holds it after the request. */
export type CartOutcome = { ok: true; items: ServerCartLine[] } | ({ ok: false } & CartFailure)

const cartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  ),
})
const errorSchema = z.object({ error: z.object({ code: z.string() }) })

async function request(
  token: string,
  path: string,
  init: Omit<RequestInit, 'signal' | 'headers'> & { json?: unknown } = {},
  signal?: AbortSignal,
): Promise<CartOutcome> {
  const { json, ...rest } = init
  let response: Response
  try {
    // GET, PUT and DELETE are all safe to send again, so all of them get the repeated attempts of
    // a host that is waking up.
    response = await fetchWithRetry(apiUrl(path), signal, {
      ...rest,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    })
  } catch {
    return { ok: false, reason: 'unavailable' }
  }

  const body: unknown = await response.json().catch(() => null)
  if (response.ok) {
    const parsed = cartSchema.safeParse(body)
    return parsed.success
      ? { ok: true, items: parsed.data.items }
      : { ok: false, reason: 'unavailable' }
  }
  if (response.status === 401) return { ok: false, reason: 'unauthorized' }
  // The answer to a line the API will never take: the same request would be refused again.
  if (response.status === 400) return { ok: false, reason: 'rejected' }
  if (response.status === 409) {
    const code = errorSchema.safeParse(body)
    if (code.success && code.data.error.code === 'product_unavailable') {
      return { ok: false, reason: 'rejected' }
    }
    if (code.success && code.data.error.code === 'cart_full') {
      return { ok: false, reason: 'cart-full' }
    }
  }
  // 429, 5xx, and a 409 that says the cart was busy (`cart_conflict`): worth another try later.
  return { ok: false, reason: 'unavailable' }
}

/** The signed-in account's cart. */
export const fetchServerCart = (token: string, signal?: AbortSignal) =>
  request(token, '/api/cart', {}, signal)

/** Sets the quantity of a line, making the line if there is none. */
export const setServerLine = (
  token: string,
  productId: string,
  quantity: number,
  signal?: AbortSignal,
) =>
  request(
    token,
    `/api/cart/items/${encodeURIComponent(productId)}`,
    { method: 'PUT', json: { quantity } },
    signal,
  )

/** Removes a line. Quietly does nothing when there is none. */
export const removeServerLine = (token: string, productId: string, signal?: AbortSignal) =>
  request(token, `/api/cart/items/${encodeURIComponent(productId)}`, { method: 'DELETE' }, signal)

/** Empties the cart. */
export const clearServerCart = (token: string, signal?: AbortSignal) =>
  request(token, '/api/cart', { method: 'DELETE' }, signal)
