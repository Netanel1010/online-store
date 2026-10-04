import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { EmptyState } from '@/components/shared/StateMessages'
import { Skeleton } from '@/components/shared/Skeleton'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useCartStore } from '@/features/cart/cartStore'
import { CartLineItem } from '@/features/cart/CartLineItem'
import { OrderSummary } from '@/features/cart/OrderSummary'
import { buildCartLines, summarizeCart } from '@/features/cart/summary'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'

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
  const items = useCartStore((state) => state.items)
  const removeItem = useCartStore((state) => state.removeItem)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [removedMessage, setRemovedMessage] = useState('')

  return (
    <>
      <title>עגלת קניות | N.M.S</title>
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
              <ul className="divide-y divide-line border-y border-line">
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
              <OrderSummary summary={summarizeCart(lines)} />
            </div>
          )
        }}
      </CatalogBoundary>
    </>
  )
}
