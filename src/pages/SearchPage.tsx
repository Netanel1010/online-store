import { Link, useSearchParams } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { EmptyState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { ProductListing } from '@/features/products/components/ProductListing'
import { PageMeta } from '@/components/shared/PageMeta'
import { searchMeta } from '@/lib/seo'

export function SearchPage() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()

  return (
    <>
      <PageMeta meta={searchMeta(q)} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'חיפוש' }]} />
      {/* The text is rendered as plain text by React, never as HTML. */}
      <h1 className="mb-6 text-3xl font-bold">{q ? `תוצאות חיפוש עבור “${q}”` : 'חיפוש'}</h1>

      {q === '' ? (
        <EmptyState
          title="מה מחפשים?"
          action={
            <Link to={paths.products} className={buttonStyles()}>
              לכל המוצרים
            </Link>
          }
        >
          הקלידו שם מוצר, מותג או מק&quot;ט בשורת החיפוש.
        </EmptyState>
      ) : (
        <CatalogBoundary loading={<ProductGridSkeleton />}>
          {(products) => (
            <ProductListing allProducts={products} scopeProducts={products} mode="search" />
          )}
        </CatalogBoundary>
      )}
    </>
  )
}
