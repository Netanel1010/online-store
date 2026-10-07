import { Link, useLocation, useParams } from 'react-router'
import { paths } from '@/app/paths'
import { PageMeta } from '@/components/shared/PageMeta'
import { DemoNotice } from '@/components/shared/Notices'
import { Skeleton } from '@/components/shared/Skeleton'
import { SlowLoadNotice } from '@/components/shared/SlowLoadNotice'
import { EmptyState, ErrorState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { OrderSummary } from '@/features/cart/OrderSummary'
import type { Order } from '@/features/orders/orderSchema'
import { OrderSnapshotLines } from '@/features/orders/OrderSnapshotLines'
import { useOrder } from '@/features/orders/useOrder'
import { formatDateTime } from '@/lib/format'
import { noindexMeta } from '@/lib/seo'

function OrderSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען את פרטי ההזמנה…</span>
      <div aria-hidden="true" className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
      <SlowLoadNotice />
    </div>
  )
}

/** Where the order goes and who it is for, exactly as it was entered when the order was placed. */
function DeliveryDetails({ delivery }: { delivery: Order['delivery'] }) {
  const house = delivery.apartment
    ? `${delivery.houseNumber}, דירה ${delivery.apartment}`
    : delivery.houseNumber
  const address = [`${delivery.street} ${house}`, delivery.city, delivery.postalCode]
    .filter(Boolean)
    .join(', ')

  return (
    <section
      aria-labelledby="delivery-heading"
      className="rounded-xl border border-line bg-white p-5"
    >
      <h2 id="delivery-heading" className="text-lg font-bold">
        פרטי משלוח
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">שם</dt>
        <dd>{delivery.fullName}</dd>
        <dt className="text-muted">אימייל</dt>
        <dd>
          <bdi dir="ltr">{delivery.email}</bdi>
        </dd>
        <dt className="text-muted">טלפון</dt>
        <dd>
          <bdi dir="ltr">{delivery.phone}</bdi>
        </dd>
        <dt className="text-muted">כתובת</dt>
        <dd>{address}</dd>
        {delivery.notes && (
          <>
            <dt className="text-muted">הערות</dt>
            <dd className="whitespace-pre-line">{delivery.notes}</dd>
          </>
        )}
      </dl>
    </section>
  )
}

/**
 * One order of the signed-in account, read from the API by its order number: the confirmation after
 * checkout, and later the same page from the order history. Everything on it is the server's: the
 * product names, the prices and the totals are the ones frozen when the order was placed, and a
 * reload, a new tab or a link opens the same page. The router's state is used for one thing only,
 * the wording of the heading right after the order was placed.
 */
export function OrderPage() {
  const { orderNumber = '' } = useParams()
  const location = useLocation()
  const justPlaced = (location.state as { justPlaced?: unknown } | null)?.justPlaced === true
  const { view, retry } = useOrder(orderNumber)

  if (view.status === 'loading') {
    return (
      <>
        <PageMeta meta={noindexMeta('פרטי הזמנה')} />
        <OrderSkeleton />
      </>
    )
  }

  if (view.status === 'not-found') {
    return (
      <>
        <PageMeta meta={noindexMeta('ההזמנה לא נמצאה')} />
        <EmptyState
          as="h1"
          title="ההזמנה לא נמצאה"
          action={
            <Link to={paths.home} className={buttonStyles()}>
              לדף הבית
            </Link>
          }
        >
          לא מצאנו הזמנה בשם הזה בחשבון שלכם.
        </EmptyState>
      </>
    )
  }

  if (view.status === 'unavailable') {
    return (
      <>
        <PageMeta meta={noindexMeta('פרטי הזמנה')} />
        <ErrorState title="לא הצלחנו לטעון את ההזמנה" onRetry={retry}>
          אי אפשר להתחבר לשרת כרגע. ההזמנה לא נפגעה. נסו שוב בעוד רגע.
        </ErrorState>
      </>
    )
  }

  const { order } = view
  const itemCount = order.lines.reduce((sum, line) => sum + line.quantity, 0)

  return (
    <>
      <PageMeta meta={noindexMeta(justPlaced ? 'ההזמנה התקבלה' : 'פרטי הזמנה')} />
      <h1 className="mb-2 text-3xl font-bold">{justPlaced ? 'ההזמנה התקבלה' : 'פרטי הזמנה'}</h1>
      <p role="status" className="mb-6 text-muted">
        מספר הזמנת הדגמה:{' '}
        <bdi className="font-semibold text-ink" dir="ltr">
          {order.orderNumber}
        </bdi>
        {' · '}
        <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
      </p>

      <DemoNotice>
        זו הייתה הזמנת הדגמה: לא בוצע חיוב, לא יישלח מוצר, ולא נשלח אימייל אל{' '}
        <bdi dir="ltr">{order.delivery.email}</bdi>. ההזמנה ופרטי המשלוח שהזנתם נשמרו בחשבון שלכם.
      </DemoNotice>

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <OrderSnapshotLines lines={order.lines} label="המוצרים שהוזמנו" />
          <DeliveryDetails delivery={order.delivery} />
        </div>
        <OrderSummary
          summary={{
            itemCount,
            originalTotal: order.originalTotal,
            total: order.total,
            savings: order.savings,
          }}
        />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={paths.products} className={buttonStyles()}>
          המשך קנייה
        </Link>
        <Link to={paths.orders} className={buttonStyles({ variant: 'secondary' })}>
          ההזמנות שלי
        </Link>
        <Link to={paths.home} className={buttonStyles({ variant: 'secondary' })}>
          לדף הבית
        </Link>
      </div>
    </>
  )
}
