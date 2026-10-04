import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { ProductListing } from '@/features/products/components/ProductListing'

export function ProductsPage() {
  return (
    <>
      <title>כל המוצרים | N.M.S</title>
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'מוצרים' }]} />
      <h1 className="mb-6 text-3xl font-bold">כל המוצרים</h1>
      <CatalogBoundary loading={<ProductGridSkeleton />}>
        {(products) => <ProductListing allProducts={products} products={products} />}
      </CatalogBoundary>
    </>
  )
}
