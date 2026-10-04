import { Link, useParams } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { findCategory } from '@/features/products/categories'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { ProductDetails } from '@/features/products/components/ProductDetails'
import { findProduct } from '@/features/products/selectors'

function ProductDetailSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען מוצר…</span>
      <div aria-hidden="true" className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full" />
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

  return (
    <CatalogBoundary loading={<ProductDetailSkeleton />}>
      {(products) => {
        const product = findProduct(products, productId)

        if (!product) {
          return (
            <>
              <title>המוצר לא נמצא | N.M.S</title>
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

        const category = findCategory(product.category)
        return (
          <>
            <title>{`${product.name} | N.M.S`}</title>
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
      }}
    </CatalogBoundary>
  )
}
