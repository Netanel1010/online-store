import { Link, useParams } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { SlowLoadNotice } from '@/components/shared/SlowLoadNotice'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState, ErrorState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { findCategory } from '@/features/products/categories'
import { ProductDetails } from '@/features/products/components/ProductDetails'
import { useProduct } from '@/features/products/useProduct'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta, productMeta } from '@/lib/seo'

function ProductDetailSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען מוצר…</span>
      <div aria-hidden="true" className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <Skeleton className="aspect-[4/3] w-full sm:aspect-square" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  )
}

export function ProductDetailPage() {
  const { productId } = useParams()
  const state = useProduct(productId)

  if (state.status === 'loading') {
    return (
      <>
        <ProductDetailSkeleton />
        <SlowLoadNotice />
      </>
    )
  }
  if (state.status === 'error') return <ErrorState onRetry={state.retry} />

  if (state.status === 'not-found') {
    return (
      <>
        <PageMeta meta={noindexMeta('המוצר לא נמצא')} />
        <EmptyState
          title="המוצר לא נמצא"
          as="h1"
          action={
            <Link to={paths.products} className={buttonStyles()}>
              לכל המוצרים
            </Link>
          }
        >
          ייתכן שהמוצר הוסר או שהכתובת שגויה.
        </EmptyState>
      </>
    )
  }

  const { product } = state
  const category = findCategory(product.category)
  return (
    <>
      <PageMeta meta={productMeta(product, category)} />
      <Breadcrumbs
        items={[
          { label: 'בית', to: paths.home },
          { label: 'מוצרים', to: paths.products },
          ...(category ? [{ label: category.label, to: paths.category(category.id) }] : []),
          { label: product.name },
        ]}
      />
      <ProductDetails product={product} />
    </>
  )
}
