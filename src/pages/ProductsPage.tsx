import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { ProductListing } from '@/features/products/components/ProductListing'
import { PageMeta } from '@/components/shared/PageMeta'
import { productsMeta } from '@/lib/seo'

export function ProductsPage() {
  return (
    <>
      <PageMeta meta={productsMeta()} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'מוצרים' }]} />
      <h1 className="mb-6 text-3xl font-bold">כל המוצרים</h1>
      <ProductListing mode="all" />
    </>
  )
}
