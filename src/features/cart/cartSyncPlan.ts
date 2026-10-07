import type { CartItem } from './cartStore.ts'

/** One request that brings the API's cart closer to this browser's. */
export type CartChange =
  | { kind: 'set'; productId: string; quantity: number }
  | { kind: 'remove'; productId: string }
  | { kind: 'clear' }

/**
 * What to send so that the cart the API holds (`known`, line by line) becomes `wanted`. Only the
 * lines that differ are sent, removals first. A cart that is wanted empty is emptied in one request.
 *
 * `known` is only what this browser has itself read or written, never a copy of the whole cart on the
 * API: a line that someone added on another device is not in it, so it is left alone.
 */
export function planChanges(
  known: ReadonlyMap<string, number>,
  wanted: readonly CartItem[],
): CartChange[] {
  if (wanted.length === 0) return known.size > 0 ? [{ kind: 'clear' }] : []
  const wantedIds = new Set(wanted.map((item) => item.productId))
  const removals = [...known.keys()]
    .filter((productId) => !wantedIds.has(productId))
    .map((productId): CartChange => ({ kind: 'remove', productId }))
  const sets = wanted
    .filter((item) => known.get(item.productId) !== item.quantity)
    .map(({ productId, quantity }): CartChange => ({ kind: 'set', productId, quantity }))
  return [...removals, ...sets]
}

/**
 * The carts of one visitor from two places (the one kept in this browser while signed out, and the
 * one on the API), joined: every product from either, and for a product in both the larger quantity.
 * Not the sum: a cart that was already saved and is merged again (a sign-in whose cart came back from
 * this very browser) must not double.
 *
 * The API's lines come first, in their order, then the lines only this browser had.
 */
export function mergeCarts(
  fromApi: readonly CartItem[],
  fromBrowser: readonly CartItem[],
): CartItem[] {
  const browser = new Map(fromBrowser.map((item) => [item.productId, item.quantity]))
  const known = new Set(fromApi.map((item) => item.productId))
  return [
    ...fromApi.map(({ productId, quantity }) => ({
      productId,
      quantity: Math.max(quantity, browser.get(productId) ?? 0),
    })),
    ...fromBrowser.filter((item) => !known.has(item.productId)),
  ]
}
