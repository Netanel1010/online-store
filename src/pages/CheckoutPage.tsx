import { Link, useNavigate } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DemoNotice } from '@/components/shared/Notices'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState } from '@/components/shared/StateMessages'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useCurrentUser } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { OrderLines } from '@/features/cart/OrderLines'
import { OrderSummary } from '@/features/cart/OrderSummary'
import { buildCartLines, summarizeCart } from '@/features/cart/summary'
import { CheckoutForm, type SubmitOutcome } from '@/features/checkout/CheckoutForm'
import {
  EmptyOrderError,
  placeDemoOrder,
  type CheckoutSuccessState,
} from '@/features/checkout/placeOrder'
import type { CheckoutValues } from '@/features/checkout/schema'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import type { Product } from '@/features/products/schema'

function CheckoutSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">טוען את ההזמנה…</span>
      <div aria-hidden="true" className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  )
}

/** Reached only through RequireAuth, so a signed-in visitor is guaranteed here. */
export function CheckoutPage() {
  const user = useCurrentUser()
  const items = useCartStore((state) => state.items)
  const navigate = useNavigate()

  const placeOrder =
    (products: readonly Product[]) =>
    (values: CheckoutValues): SubmitOutcome => {
      try {
        // Read the cart at submit time: it may have changed in another tab since this page rendered.
        const order = placeDemoOrder({
          items: useCartStore.getState().items,
          products,
          email: values.email,
        })
        const state: CheckoutSuccessState = order
        navigate(paths.checkoutSuccess, { replace: true, state })
        useCartStore.getState().clear()
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof EmptyOrderError
              ? 'העגלה ריקה או שהמוצרים בה אינם זמינים עוד. חזרו לעגלה ונסו שוב.'
              : 'לא הצלחנו להשלים את ההזמנה. נסו שוב.',
        }
      }
    }

  return (
    <>
      <title>סיום הזמנה | N.M.S</title>
      <Breadcrumbs
        items={[
          { label: 'בית', to: paths.home },
          { label: 'עגלת קניות', to: paths.cart },
          { label: 'סיום הזמנה' },
        ]}
      />
      <h1 className="mb-6 text-3xl font-bold">סיום הזמנה</h1>

      <CatalogBoundary loading={<CheckoutSkeleton />}>
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
                אין מה להזמין עדיין. הוסיפו מוצרים לעגלה ואז חזרו לכאן.
              </EmptyState>
            )
          }

          return (
            <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
              <div className="max-w-4xl space-y-6">
                <DemoNotice>
                  זו הזמנת הדגמה: לא מתבצע חיוב, לא נשלח מוצר, ולא נשמרים פרטים. אל תזינו פרטים
                  אמיתיים שאינכם רוצים להקליד.
                </DemoNotice>
                <CheckoutForm
                  defaultValues={{ fullName: user?.name ?? '', email: user?.email ?? '' }}
                  onSubmit={placeOrder(products)}
                />
              </div>

              <div className="space-y-4">
                <OrderLines lines={lines} label="המוצרים בהזמנה" />
                <OrderSummary summary={summarizeCart(lines)}>
                  <Link
                    to={paths.cart}
                    className={`${buttonStyles({ variant: 'secondary' })} w-full`}
                  >
                    חזרה לעגלה
                  </Link>
                </OrderSummary>
              </div>
            </div>
          )
        }}
      </CatalogBoundary>
    </>
  )
}
