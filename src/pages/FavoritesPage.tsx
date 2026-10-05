import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { TrashIcon } from '@/components/icons'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { EmptyState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { AddToCartButton } from '@/features/cart/AddToCartButton'
import { favoriteProducts } from '@/features/favorites/favoriteProducts'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { ProductGrid, ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta } from '@/lib/seo'

export function FavoritesPage() {
  const ids = useFavoritesStore((state) => state.ids)
  const remove = useFavoritesStore((state) => state.remove)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [removedMessage, setRemovedMessage] = useState('')

  return (
    <>
      <PageMeta meta={noindexMeta('מועדפים')} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'מועדפים' }]} />
      {/* Focus lands here after a removal, so keyboard users do not lose their place. */}
      <h1 ref={headingRef} tabIndex={-1} className="mb-6 text-3xl font-bold focus:outline-none">
        מועדפים
      </h1>
      <p role="status" className="sr-only">
        {removedMessage}
      </p>

      <CatalogBoundary loading={<ProductGridSkeleton count={4} />}>
        {(products) => {
          const favorites = favoriteProducts(ids, products)

          if (favorites.length === 0) {
            return (
              <EmptyState
                title="אין מוצרים במועדפים"
                action={
                  <Link to={paths.products} className={buttonStyles()}>
                    לכל המוצרים
                  </Link>
                }
              >
                סמנו מוצרים בלב כדי לשמור אותם כאן.
              </EmptyState>
            )
          }

          return (
            <>
              <p className="mb-4 text-sm text-muted">{favorites.length} מוצרים</p>
              <ProductGrid
                products={favorites}
                headingAs="h2"
                renderActions={(product) => (
                  <div className="flex items-start gap-2">
                    <AddToCartButton product={product} className="flex-1" />
                    <button
                      type="button"
                      aria-label={`הסרת ${product.name} מהמועדפים`}
                      onClick={() => {
                        remove(product.id)
                        setRemovedMessage(`${product.name} הוסר מהמועדפים`)
                        headingRef.current?.focus()
                      }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-muted hover:bg-surface hover:text-sale"
                    >
                      <TrashIcon className="size-4" />
                      הסרה
                    </button>
                  </div>
                )}
              />
            </>
          )
        }}
      </CatalogBoundary>
    </>
  )
}
