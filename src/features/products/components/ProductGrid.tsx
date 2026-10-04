import type { ReactNode } from 'react'
import { Skeleton } from '@/components/shared/Skeleton'
import type { Product } from '../schema'
import { ProductCard } from './ProductCard'

const gridClass = 'grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'

interface ProductGridProps {
  products: readonly Product[]
  headingAs?: 'h2' | 'h3'
  /** Per-product controls, rendered in each card's actions slot. */
  renderActions?: (product: Product) => ReactNode
}

export function ProductGrid({ products, headingAs, renderActions }: ProductGridProps) {
  return (
    <ul className={gridClass}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} headingAs={headingAs} actions={renderActions?.(product)} />
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
