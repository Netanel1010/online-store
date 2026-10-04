import { AddToCartButton } from '@/features/cart/AddToCartButton'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import type { Product } from '@/features/products/schema'

/** The controls shown on every product card. */
export function ProductCardActions({ product }: { product: Product }) {
  return (
    <div className="flex items-start gap-2">
      <AddToCartButton product={product} className="flex-1" />
      <FavoriteButton product={product} />
    </div>
  )
}
