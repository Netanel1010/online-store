import type { ReactNode } from 'react'
import { Skeleton } from '@/components/shared/Skeleton'
import { ProductCardActions } from '@/features/shop/ProductCardActions'
import type { Product } from '../schema'
import { ProductCard } from './ProductCard'

const gridClass = 'grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
// Without a filter panel beside it (home page), a wide screen has room for a fifth column.
const wideGridClass = `${gridClass} min-[87.5rem]:grid-cols-5`

interface ProductGridProps {
  products: readonly Product[]
  headingAs?: 'h2' | 'h3'
  /** Per-product controls for each card's actions slot. Defaults to add-to-cart + favorite. */
  renderActions?: (product: Product) => ReactNode
  /** Use the extra column on wide screens. For grids that do not share the row with a panel. */
  wide?: boolean
}

const defaultActions = (product: Product) => <ProductCardActions product={product} />

export function ProductGrid({
  products,
  headingAs,
  renderActions = defaultActions,
  wide = false,
}: ProductGridProps) {
  return (
    <ul className={wide ? wideGridClass : gridClass}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} headingAs={headingAs} actions={renderActions(product)} />
        </li>
      ))}
    </ul>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען מוצרים…</span>
      <div className={gridClass} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="rounded-xl border border-line p-4">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="mt-4 h-4 w-1/3" />
            <Skeleton className="mt-3 h-5 w-full" />
            <Skeleton className="mt-2 h-5 w-2/3" />
            <Skeleton className="mt-4 h-6 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
