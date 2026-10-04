import type { CategoryId } from './categories'
import type { Product } from './schema'

export function findProduct(products: readonly Product[], id: string | undefined) {
  return id === undefined ? undefined : products.find((product) => product.id === id)
}

export function productsInCategory(products: readonly Product[], category: CategoryId) {
  return products.filter((product) => product.category === category)
}

export function recommendedProducts(products: readonly Product[]) {
  return products.filter((product) => product.isRecommended)
}

export function saleProducts(products: readonly Product[]) {
  return products.filter((product) => product.price.original !== undefined)
}

export function countByCategory(products: readonly Product[]) {
  const counts = new Map<CategoryId, number>()
  for (const product of products) {
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1)
  }
  return counts
}

/** Whole-number discount percentage, or undefined when the product is not on sale. */
export function discountPercent(price: Product['price']): number | undefined {
  if (price.original === undefined) return undefined
  return Math.round((1 - price.current / price.original) * 100)
}
