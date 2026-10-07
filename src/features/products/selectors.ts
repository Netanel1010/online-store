import type { Product } from './schema'

/** Whole-number discount percentage, or undefined when the product is not on sale. */
export function discountPercent(price: Product['price']): number | undefined {
  if (price.original === undefined) return undefined
  return Math.round((1 - price.current / price.original) * 100)
}
