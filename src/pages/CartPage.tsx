import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { EmptyState } from '@/components/shared/StateMessages'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useAuthStatus, useCurrentUser } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { useCartIsLoading } from '@/features/cart/cartSyncStatus'
import { CartLineItem } from '@/features/cart/CartLineItem'
import { OrderSummary } from '@/features/cart/OrderSummary'
import { buildCartLines, summarizeCart } from '@/features/cart/summary'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta } from '@/lib/seo'

function CartSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען עגלה…</span>
      <div aria-hidden="true" className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-52 w-full" />
      </div>
    </div>
  )
}

export function CartPage() {
  const user = useCurrentUser()
  const authStatus = useAuthStatus()
  const items = useCartStore((state) => state.items)
  const waitingForCart = useCartIsLoading()
  const removeItem = useCartStore((state) => state.removeItem)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [removedMessage, setRemovedMessage] = useState('')

  return (
    <>
      <PageMeta meta={noindexMeta('עגלת קניות')} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'עגלת קניות' }]} />
      {/* Focus lands here after a line is removed, so keyboard users do not lose their place. */}
      <h1 ref={headingRef} tabIndex={-1} className="mb-6 text-3xl font-bold focus:outline-none">
        עגלת קניות
      </h1>
      <p role="status" className="sr-only">
        {removedMessage}
      </p>

      <CatalogBoundary loading={<CartSkeleton />}>
        {(products) => {
          const lines = buildCartLines(items, products)

          if (lines.length === 0 && waitingForCart) return <CartSkeleton />
          if (lines.length === 0) {
            return (
              <EmptyState
                title="העגלה ריקה"
                action={
                  <Link to={paths.products} className={buttonStyles()}>
                    לכל המוצרים
                  </Link>
                }
              >
                עדיין לא הוספתם מוצרים לעגלה.
              </EmptyState>
            )
          }

          return (
            <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
              <ul className="max-w-4xl divide-y divide-line border-y border-line">
                {lines.map((line) => (
                  <CartLineItem
                    key={line.product.id}
                    line={line}
                    onRemove={(productId) => {
                      removeItem(productId)
                      setRemovedMessage(`${line.product.name} הוסר מהעגלה`)
                      headingRef.current?.focus()
                    }}
                  />
                ))}
              </ul>
              <OrderSummary summary={summarizeCart(lines)}>
                <Link to={paths.checkout} className={`${buttonStyles()} w-full`}>
                  מעבר לסיום ההזמנה
                </Link>
                <Link
                  to={paths.products}
                  className="mt-3 block rounded text-center text-sm text-brand underline-offset-4 hover:underline"
                >
                  המשך בקניות
                </Link>
                {!user && authStatus !== 'restoring' && (
                  <p className="mt-2 text-center text-xs text-muted">
                    כדי להמשיך תתבקשו להתחבר או להירשם.
                  </p>
                )}
              </OrderSummary>
            </div>
          )
        }}
      </CatalogBoundary>
    </>
  )
}
