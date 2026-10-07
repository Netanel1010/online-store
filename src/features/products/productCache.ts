import { useSyncExternalStore } from 'react'
import type { Product } from './schema'

/**
 * The products this visit has already seen, by id: a product page, a listing, a lookup. Nothing
 * reads it to decide what to show on a page (a page asks the API for its own products); it only lets
 * a part of the layout that has no request of its own, such as the category links of the header,
 * know about the product the page in front of the visitor is showing.
 */
const cache = new Map<string, Product>()
const listeners = new Set<() => void>()

export function rememberProducts(products: readonly Product[]) {
  let changed = false
  for (const product of products) {
    if (cache.get(product.id) !== product) {
      cache.set(product.id, product)
      changed = true
    }
  }
  if (changed) listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The product with this id if this visit has seen it, otherwise undefined. It never asks the API. */
export function useCachedProduct(id: string | null): Product | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (id === null ? undefined : cache.get(id)),
    () => undefined,
  )
}

/** Test helper: forget every product. */
export function resetProductCache() {
  cache.clear()
  listeners.forEach((listener) => listener())
}
