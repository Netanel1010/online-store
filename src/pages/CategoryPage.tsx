import { useParams } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { findCategory } from '@/features/products/categories'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { ProductListing } from '@/features/products/components/ProductListing'
import { productsInCategory } from '@/features/products/selectors'
import { NotFoundPage } from './NotFoundPage'

export function CategoryPage() {
  const { categoryId } = useParams()
  const category = findCategory(categoryId)

  if (!category) return <NotFoundPage />

  return (
    <>
      <title>{`${category.label} | N.M.S`}</title>
      <Breadcrumbs
        items={[
          { label: 'בית', to: paths.home },
          { label: 'מוצרים', to: paths.products },
          { label: category.label },
        ]}
      />
      <h1 className="mb-6 text-3xl font-bold">{category.label}</h1>
      <CatalogBoundary loading={<ProductGridSkeleton />}>
        {(products) => (
          <ProductListing
            allProducts={products}
            scopeProducts={productsInCategory(products, category.id)}
            mode="category"
            activeCategory={category.id}
          />
        )}
      </CatalogBoundary>
    </>
  )
}
