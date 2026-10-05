import { useId } from 'react'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { ProductGrid } from '@/features/products/components/ProductGrid'
import type { Product } from '@/features/products/schema'

interface ProductSectionProps {
  title: string
  products: readonly Product[]
}

/** A titled product grid for the home page. Renders nothing when there are no products. */
export function ProductSection({ title, products }: ProductSectionProps) {
  const headingId = useId()
  if (products.length === 0) return null

  return (
    <section aria-labelledby={headingId} className="mt-12">
      <SectionHeading id={headingId}>{title}</SectionHeading>
      <ProductGrid products={products} headingAs="h3" wide />
    </section>
  )
}
