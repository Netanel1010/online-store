import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageMeta } from '@/components/shared/PageMeta'
import { Skeleton } from '@/components/shared/Skeleton'
import { SlowLoadNotice } from '@/components/shared/SlowLoadNotice'
import { EmptyState, ErrorState } from '@/components/shared/StateMessages'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import type { Order } from '@/features/orders/orderSchema'
import { useOrders } from '@/features/orders/useOrders'
import { formatDateTime, formatPrice } from '@/lib/format'
import { noindexMeta } from '@/lib/seo'

function OrdersSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען את ההזמנות…</span>
      <div aria-hidden="true" className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <SlowLoadNotice />
    </div>
  )
}

/** What the order says about itself: its state, as the API reports it. */
const STATUS_LABEL: Record<Order['status'], string> = { placed: 'התקבלה' }

function OrderCard({ order }: { order: Order }) {
  const units = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const { delivery } = order

  return (
    <li className="rounded-xl border border-line bg-white p-4 shadow-sm transition-colors hover:border-brand">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">
            <Link to={paths.order(order.orderNumber)} className="rounded hover:text-brand">
              <bdi dir="ltr">{order.orderNumber}</bdi>
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted">
            <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
          </p>
        </div>
        <p className="text-lg font-bold">
          <span className="sr-only">סה&quot;כ: </span>
          {formatPrice(order.total)}
        </p>
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
          {STATUS_LABEL[order.status]}
        </span>
        <span>{units === 1 ? 'פריט אחד' : `${units} פריטים`}</span>
        <span>משלוח אל {delivery.city}</span>
        <span>
          עבור <bdi>{delivery.fullName}</bdi>
        </span>
      </p>

      <p className="mt-3">
        <Link
          to={paths.order(order.orderNumber)}
          className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
        >
          לפרטי ההזמנה
          <span className="sr-only"> {order.orderNumber}</span>
        </Link>
      </p>
    </li>
  )
}

/**
 * The signed-in account's orders, the newest first (the order the API gives them in), each linking
 * to its own page. It shows what the orders say about themselves and works nothing out from the
 * catalog, so a repriced or removed product changes nothing here.
 */
export function MyOrdersPage() {
  const { view, loadMore, retry } = useOrders()

  return (
    <>
      <PageMeta meta={noindexMeta('ההזמנות שלי')} />
      <Breadcrumbs items={[{ label: 'בית', to: paths.home }, { label: 'ההזמנות שלי' }]} />
      <h1 className="mb-6 text-3xl font-bold">ההזמנות שלי</h1>

      {view.status === 'loading' && <OrdersSkeleton />}

      {view.status === 'unavailable' && (
        <ErrorState title="לא הצלחנו לטעון את ההזמנות" onRetry={retry}>
          אי אפשר להתחבר לשרת כרגע. ההזמנות שלכם לא נפגעו. נסו שוב בעוד רגע.
        </ErrorState>
      )}

      {view.status === 'ready' && view.orders.length === 0 && (
        <EmptyState
          title="עדיין אין לכם הזמנות"
          action={
            <Link to={paths.products} className={buttonStyles()}>
              לכל המוצרים
            </Link>
          }
        >
          כשתשלימו הזמנה היא תופיע כאן.
        </EmptyState>
      )}

      {view.status === 'ready' && view.orders.length > 0 && (
        <>
          <p className="mb-4 text-sm text-muted">
            {view.total === 1 ? 'הזמנה אחת' : `${view.total} הזמנות`}, מהחדשה לישנה.
          </p>
          <ul aria-label="ההזמנות שלי" className="max-w-4xl space-y-3">
            {view.orders.map((order) => (
              <OrderCard key={order.orderNumber} order={order} />
            ))}
          </ul>

          {view.moreFailed && (
            <p role="alert" className="mt-4 text-sm text-sale">
              לא הצלחנו לטעון עוד הזמנות. ההזמנות שמוצגות נכונות. נסו שוב.
            </p>
          )}
          {view.hasMore && (
            <div className="mt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={loadMore}
                disabled={view.loadingMore}
              >
                {view.loadingMore ? 'טוען…' : 'הצגת הזמנות נוספות'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
