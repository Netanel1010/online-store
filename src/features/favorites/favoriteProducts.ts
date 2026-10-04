import type { Product } from '@/features/products/schema'

/** Joins favorite ids with the catalog, keeping the order they were added and skipping unknown ids. */
export function favoriteProducts(ids: readonly string[], products: readonly Product[]) {
  const byId = new Map(products.map((product) => [product.id, product]))
  return ids.flatMap((id) => {
    const product = byId.get(id)
    return product ? [product] : []
  })
}
