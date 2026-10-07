import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '@/app/paths'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { DemoNotice } from '@/components/shared/Notices'
import { PageMeta } from '@/components/shared/PageMeta'
import { Skeleton } from '@/components/shared/Skeleton'
import { EmptyState } from '@/components/shared/StateMessages'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { useAuthStore, useCurrentUser } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { useCartIsLoading } from '@/features/cart/cartSyncStatus'
import { OrderLines } from '@/features/cart/OrderLines'
import { OrderSummary } from '@/features/cart/OrderSummary'
import { buildCartLines, summarizeCart } from '@/features/cart/summary'
import { CheckoutForm, type SubmitOutcome } from '@/features/checkout/CheckoutForm'
import type { CheckoutValues } from '@/features/checkout/schema'
import { submitOrder } from '@/features/orders/submitOrder'
import { CatalogBoundary } from '@/features/products/components/CatalogBoundary'
import type { Product } from '@/features/products/schema'
import { formatPrice } from '@/lib/format'
import { noindexMeta } from '@/lib/seo'

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

/** What the API said about the order that the visitor can act on. */
type Problem =
  { kind: 'unavailable'; productIds: string[] } | { kind: 'price-changed'; total: number }

const GENERIC_FAILURE = 'לא הצלחנו להשלים את ההזמנה. נסו שוב.'

/** Reached only through RequireAuth, so a signed-in visitor is guaranteed here. */
export function CheckoutPage() {
  const user = useCurrentUser()
  const items = useCartStore((state) => state.items)
  const waitingForCart = useCartIsLoading()
  const navigate = useNavigate()
  const [problem, setProblem] = useState<Problem | null>(null)
  // The total the visitor agreed to after being told that it changed.
  const [agreedTotal, setAgreedTotal] = useState<number | null>(null)

  const placeOrder =
    (products: readonly Product[]) =>
    async (values: CheckoutValues): Promise<SubmitOutcome> => {
      const token = useAuthStore.getState().token
      if (!user || !token) return { ok: false, message: GENERIC_FAILURE }

      setProblem(null)
      // Read the cart at submit time: it may have changed in another tab since this page rendered.
      const cart = useCartStore.getState().items
      const outcome = await submitOrder({
        token,
        userId: user.id,
        items: cart,
        values,
        // What the page showed, unless the visitor has since agreed to a new total. The API decides
        // what the order costs; this only stops it from costing something else than was shown.
        expectedTotal: agreedTotal ?? summarizeCart(buildCartLines(cart, products)).total,
      })

      if (outcome.ok) {
        navigate(paths.order(outcome.order.orderNumber), {
          replace: true,
          state: { justPlaced: true },
        })
        useCartStore.getState().clear()
        return { ok: true }
      }

      switch (outcome.reason) {
        case 'unauthorized':
          // The session is over: signing out sends the visitor to the login page, and back here.
          useAuthStore.getState().logout()
          return { ok: false, message: 'ההתחברות הסתיימה. התחברו שוב כדי להשלים את ההזמנה.' }
        case 'product-unavailable':
          setProblem({ kind: 'unavailable', productIds: outcome.productIds })
          return { ok: false, message: '' }
        case 'price-changed':
          setProblem({ kind: 'price-changed', total: outcome.total })
          setAgreedTotal(outcome.total)
          return { ok: false, message: '' }
        case 'too-many-requests':
          return { ok: false, message: 'ניסיתם להזמין יותר מדי פעמים. נסו שוב בעוד זמן מה.' }
        case 'invalid-input':
          return { ok: false, message: 'השרת לא קיבל את פרטי ההזמנה. בדקו את הפרטים ונסו שוב.' }
        case 'key-reused':
          return { ok: false, message: GENERIC_FAILURE }
        case 'unavailable':
          return {
            ok: false,
            message:
              'לא הצלחנו להשלים את ההזמנה. בדקו את החיבור ונסו שוב. אם ההזמנה כבר נשלחה, לא תיווצר הזמנה כפולה.',
          }
      }
    }

  const notice = (products: readonly Product[]) => {
    if (!problem) return null
    if (problem.kind === 'price-changed') {
      return (
        <div
          role="alert"
          className="rounded-lg border border-sale/30 bg-sale-soft px-4 py-3 text-sm text-sale"
        >
          המחיר השתנה מאז שהוצג לכם. הסכום המעודכן להזמנה הוא{' '}
          <strong>{formatPrice(problem.total)}</strong>. אם זה מתאים לכם, לחצו שוב על אישור הזמנה.
        </div>
      )
    }
    const names = problem.productIds.map(
      (id) => products.find((product) => product.id === id)?.name ?? id,
    )
    return (
      <div
        role="alert"
        className="space-y-3 rounded-lg border border-sale/30 bg-sale-soft px-4 py-3 text-sm text-sale"
      >
        <p>
          מוצרים בעגלה אינם זמינים עוד, ולכן ההזמנה לא בוצעה: <strong>{names.join(', ')}</strong>.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            for (const id of problem.productIds) useCartStore.getState().removeItem(id)
            setProblem(null)
          }}
        >
          הסרה מהעגלה
        </Button>
      </div>
    )
  }

  return (
    <>
      <PageMeta meta={noindexMeta('סיום הזמנה')} />
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

          if (lines.length === 0 && waitingForCart) return <CheckoutSkeleton />
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
                  זו הזמנת הדגמה: לא מתבצע חיוב ולא נשלח מוצר. ההזמנה ופרטי המשלוח נשמרים בחשבון
                  שלכם בשרת האתר, לכן אל תזינו פרטים אמיתיים שאינכם רוצים שיישמרו.
                </DemoNotice>
                <CheckoutForm
                  defaultValues={{ fullName: user?.name ?? '', email: user?.email ?? '' }}
                  onSubmit={placeOrder(products)}
                  notice={notice(products)}
                  totalNote={
                    <p className="flex items-baseline justify-between gap-4 rounded-xl bg-brand-soft px-4 py-3 lg:hidden">
                      <span className="text-sm font-semibold">סה&quot;כ להזמנה</span>
                      <strong className="text-xl">{formatPrice(summarizeCart(lines).total)}</strong>
                    </p>
                  }
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
