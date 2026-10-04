import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { EmptyState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import type { CategoryId } from '../categories'
import type { Product } from '../schema'
import { CategoryFilterNav } from './CategoryFilterNav'
import { ProductGrid } from './ProductGrid'

interface ProductListingProps {
  /** The whole catalog, used for the category counts. */
  allProducts: readonly Product[]
  /** The products to show. */
  products: readonly Product[]
  activeCategory?: CategoryId
}

/** Shared body of the products and category pages. */
export function ProductListing({ allProducts, products, activeCategory }: ProductListingProps) {
  return (
    <>
      <CategoryFilterNav products={allProducts} active={activeCategory} />
      {products.length === 0 ? (
        <EmptyState
          title="אין מוצרים להצגה"
          action={
            <Link to={paths.products} className={buttonStyles()}>
              לכל המוצרים
            </Link>
          }
        >
          עדיין אין מוצרים בקטגוריה הזו.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">{products.length} מוצרים</p>
          <ProductGrid products={products} headingAs="h2" />
        </>
      )}
    </>
  )
}
