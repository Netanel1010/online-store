import type { Product } from '@/features/products/schema'
import type { CartItem } from './cartStore'

export interface CartLine {
  product: Product
  quantity: number
}

export interface CartSummary {
  /** Total units across all lines. */
  itemCount: number
  /** What the cart would cost at the previous (pre-sale) prices. */
  originalTotal: number
  /** What the cart costs at current prices. */
  total: number
  /** originalTotal - total. Zero when nothing in the cart is on sale. */
  savings: number
}

/** Joins stored ids with the catalog, keeping cart order and skipping unknown products. */
export function buildCartLines(items: readonly CartItem[], products: readonly Product[]) {
  const byId = new Map(products.map((product) => [product.id, product]))
  return items.flatMap(({ productId, quantity }) => {
    const product = byId.get(productId)
    return product ? [{ product, quantity }] : []
  })
}

export function summarizeCart(lines: readonly CartLine[]): CartSummary {
  let itemCount = 0
  let total = 0
  let originalTotal = 0
  for (const { product, quantity } of lines) {
    itemCount += quantity
    total += product.price.current * quantity
    originalTotal += (product.price.original ?? product.price.current) * quantity
  }
  return { itemCount, originalTotal, total, savings: originalTotal - total }
}
