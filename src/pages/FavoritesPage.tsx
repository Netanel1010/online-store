import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CartIcon, HeartIcon } from '@/components/icons'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageMeta } from '@/components/shared/PageMeta'
import { EmptyState } from '@/components/shared/StateMessages'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { AddToCartButton } from '@/features/cart/AddToCartButton'
import { useCartStore } from '@/features/cart/cartStore'
import { favoriteProducts } from '@/features/favorites/favoriteProducts'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { ProductSection } from '@/features/home/components/ProductSection'
import { useToast } from '@/features/notifications/toastContext'
import { ProductsBoundary } from '@/features/products/components/ProductsBoundary'
import { ProductGrid, ProductGridSkeleton } from '@/features/products/components/ProductGrid'
import type { Product } from '@/features/products/schema'
import { useRecommendedProducts } from '@/features/products/useHomeProducts'
import { noindexMeta } from '@/lib/seo'

/** Something to start from when there are no favorites: the products the store recommends. */
function RecommendedSection() {
  return <ProductSection title="מומלצים" products={useRecommendedProducts()} />
}

export function FavoritesPage() {
  const ids = useFavoritesStore((state) => state.ids)
  const remove = useFavoritesStore((state) => state.remove)
  const cartItems = useCartStore((state) => state.items)
  const addItem = useCartStore((state) => state.addItem)
  const toast = useToast()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [removedMessage, setRemovedMessage] = useState('')

  const addAllToCart = (missing: readonly Product[]) => {
    missing.forEach((product) => addItem(product.id))
    toast.show({
      message:
        missing.length === 1 ? 'מוצר אחד נוסף לעגלה' : `${missing.length} מוצרים נוספו לעגלה`,
      action: <Link to={paths.cart}>לעגלה</Link>,
    })
  }

  return (
    <>
      <PageMeta meta={noindexMeta('מועדפים')} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'מועדפים' }]} />
      {/* Focus lands here after a removal, so keyboard users do not lose their place. */}
      <h1 ref={headingRef} tabIndex={-1} className="mb-4 text-3xl font-bold focus:outline-none">
        מועדפים
      </h1>
      <p role="status" className="sr-only">
        {removedMessage}
      </p>

      <ProductsBoundary ids={ids} loading={<ProductGridSkeleton count={4} />}>
        {(products) => {
          const favorites = favoriteProducts(ids, products)

          if (favorites.length === 0) {
            return (
              <>
                <EmptyState
                  title="אין מוצרים במועדפים"
                  icon={<HeartIcon className="size-7" />}
                  action={
                    <Link to={paths.products} className={buttonStyles()}>
                      לכל המוצרים
                    </Link>
                  }
                >
                  סמנו מוצרים בלב כדי לשמור אותם כאן.
                </EmptyState>
                <RecommendedSection />
              </>
            )
          }

          const inCart = new Set(cartItems.map((item) => item.productId))
          const missing = favorites.filter((product) => !inCart.has(product.id))

          return (
            <>
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">{favorites.length} מוצרים</p>
                {missing.length > 0 ? (
                  <Button variant="secondary" onClick={() => addAllToCart(missing)}>
                    <CartIcon className="size-4" />
                    {missing.length === favorites.length
                      ? 'הוספת הכול לעגלה'
                      : `הוספת השאר לעגלה (${missing.length})`}
                  </Button>
                ) : (
                  <Link to={paths.cart} className={buttonStyles({ variant: 'secondary' })}>
                    <CartIcon className="size-4" />
                    הכול כבר בעגלה: מעבר לעגלה
                  </Link>
                )}
              </div>
              <ProductGrid
                products={favorites}
                headingAs="h2"
                wide
                renderActions={(product) => (
                  <div className="flex items-start gap-2">
                    <AddToCartButton product={product} size="md" className="flex-1" />
                    {/* The filled heart is the same sign as on the product pages: this product is a
                        favorite. Pressing it takes it out. */}
                    <button
                      type="button"
                      aria-label={`הסרת ${product.name} מהמועדפים`}
                      onClick={() => {
                        remove(product.id)
                        setRemovedMessage(`${product.name} הוסר מהמועדפים`)
                        headingRef.current?.focus()
                      }}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-sale/40 bg-sale-soft text-sale transition-colors hover:bg-white"
                    >
                      <HeartIcon filled />
                    </button>
                  </div>
                )}
              />
            </>
          )
        }}
      </ProductsBoundary>
    </>
  )
}
