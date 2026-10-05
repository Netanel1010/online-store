import { Link, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { DemoNotice } from '@/components/shared/Notices'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { OrderLines } from '@/features/cart/OrderLines'
import { OrderSummary } from '@/features/cart/OrderSummary'
import { buildCartLines, summarizeCart } from '@/features/cart/summary'
import { checkoutSuccessStateSchema } from '@/features/checkout/placeOrder'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import { PageMeta } from '@/components/shared/PageMeta'
import { noindexMeta } from '@/lib/seo'

function ConfirmationSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען את פרטי ההזמנה…</span>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

/**
 * Confirmation of a demo order. What was ordered arrives through router state (nothing is
 * stored), and the amounts are worked out from the catalog like on every other page.
 */
export function CheckoutSuccessPage() {
  const location = useLocation()
  const parsed = checkoutSuccessStateSchema.safeParse(location.state)

  if (!parsed.success) {
    return (
      <>
        <PageMeta meta={noindexMeta('אין הזמנה להצגה')} />
        <EmptyState
          as="h1"
          title="אין הזמנה להצגה"
          action={
            <Link to={paths.home} className={buttonStyles()}>
              לדף הבית
            </Link>
          }
        >
          ההזמנות בחנות ההדגמה אינן נשמרות, לכן אי אפשר לראות הזמנה ישנה.
        </EmptyState>
      </>
    )
  }

  const order = parsed.data

  return (
    <>
      <PageMeta meta={noindexMeta('ההזמנה התקבלה')} />
      <h1 className="mb-2 text-3xl font-bold">ההזמנה התקבלה</h1>
      <p role="status" className="mb-6 text-muted">
        מספר הזמנת הדגמה:{' '}
        <bdi className="font-semibold text-ink" dir="ltr">
          {order.orderId}
        </bdi>
      </p>

      <DemoNotice>
        זו הייתה הזמנת הדגמה: לא בוצע חיוב, לא יישלח מוצר, ולא נשלח אימייל אל{' '}
        <bdi dir="ltr">{order.email}</bdi>. ההזמנה אינה נשמרת, וגם הפרטים שהוזנו לא נשמרו.
      </DemoNotice>

      <div className="mt-6">
        <CatalogBoundary loading={<ConfirmationSkeleton />}>
          {(products) => {
            const lines = buildCartLines(order.items, products)
            return (
              <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
                <OrderLines lines={lines} label="המוצרים שהוזמנו" />
                <OrderSummary summary={summarizeCart(lines)} />
              </div>
            )
          }}
        </CatalogBoundary>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={paths.products} className={buttonStyles()}>
          המשך קנייה
        </Link>
        <Link to={paths.home} className={buttonStyles({ variant: 'secondary' })}>
          לדף הבית
        </Link>
      </div>
    </>
  )
}
