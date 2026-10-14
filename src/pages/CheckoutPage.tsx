import { useEffect, useRef, useState } from 'react'
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
import { takeCartNow } from '@/features/cart/cartTabSync'
import { OrderLines } from '@/features/cart/OrderLines'
import { OrderSummary } from '@/features/cart/OrderSummary'
import { buildCartLines, summarizeCart } from '@/features/cart/summary'
import { CheckoutForm, type SubmitOutcome } from '@/features/checkout/CheckoutForm'
import type { CheckoutValues } from '@/features/checkout/schema'
import { forgetCheckoutAttempt, unresolvedAttemptKey } from '@/features/orders/checkoutAttempt'
import { lookupOrder } from '@/features/orders/orderService'
import { OrderAttemptNotice, type AttemptRecovery } from '@/features/orders/OrderAttemptNotice'
import { submitOrder } from '@/features/orders/submitOrder'
import { ProductsBoundary } from '@/features/products/components/ProductsBoundary'
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

/**
 * Reached only through RequireAuth, so a signed-in visitor is guaranteed here. The page is started
 * afresh for each account: what one account saw on it (an order from an earlier attempt, a changed
 * price, what they typed) is never shown to the account that signs in next.
 */
export function CheckoutPage() {
  const user = useCurrentUser()
  return <CheckoutContent key={user?.id ?? 'signed-out'} />
}

function CheckoutContent() {
  const user = useCurrentUser()
  const items = useCartStore((state) => state.items)
  const waitingForCart = useCartIsLoading()
  const navigate = useNavigate()
  const [problem, setProblem] = useState<Problem | null>(null)
  // The total the visitor agreed to after being told that it changed.
  const [agreedTotal, setAgreedTotal] = useState<number | null>(null)
  // What the visitor was told about the order (a changed price, a product that is gone) and the total
  // they agreed to are about the cart they were looking at: when the cart changes (in another tab, say)
  // they no longer apply, and the next answer of the API is the one to go by.
  const [cartSeen, setCartSeen] = useState(items)
  if (cartSeen !== items) {
    setCartSeen(items)
    setProblem(null)
    setAgreedTotal(null)
  }
  // An order from an earlier, unresolved attempt that the API has (or that it could not tell about).
  const [recovery, setRecovery] = useState<AttemptRecovery | null>(null)
  const token = useAuthStore((state) => state.token)
  const userId = user?.id
  // The page may be left while the order is on its way: the answer then changes the cart, not the page.
  const mounted = useRef(true)
  // The account whose visitor confirmed another order besides the one that exists: its next order
  // starts a new attempt. Another account that signs in meanwhile is not the one that confirmed.
  const separateOrderFor = useRef<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // A page that opens with an unresolved attempt (after a reload, a lost answer, a return from the
  // login page) asks the API whether that attempt made an order, before the visitor retypes anything.
  // Only a clear "this order exists" or "cannot be verified" is shown; "no order" needs nothing.
  useEffect(() => {
    if (!userId || !token) return
    const key = unresolvedAttemptKey(userId)
    if (!key) return
    const controller = new AbortController()
    lookupOrder(token, key, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return
        if (outcome.status === 'found') {
          setRecovery({ kind: 'placed', orderNumber: outcome.order.orderNumber, submitted: false })
        } else if (outcome.status === 'unverified') {
          setRecovery({ kind: 'unverified' })
        } else if (outcome.status === 'unauthorized') {
          useAuthStore.getState().logout()
        }
      })
      .catch(() => {
        // Only a request the page cancelled by being left rejects; nobody is waiting for it.
      })
    return () => controller.abort()
  }, [userId, token])

  const placeOrder =
    (products: readonly Product[]) =>
    async (values: CheckoutValues): Promise<SubmitOutcome> => {
      const token = useAuthStore.getState().token
      if (!user || !token) return { ok: false, message: GENERIC_FAILURE }

      // The cart as the browser keeps it right now, not the copy this page last saw. A change from
      // another tab that has not reached this page yet (an event that was missed) is shown now, and
      // the visitor looks at it before ordering: an order is never placed from a cart that was not
      // on the screen. A cart that turns out to be empty has nothing to order; the page shows that.
      if (takeCartNow()) return { ok: false, message: '' }
      const cart = useCartStore.getState().items
      if (cart.length === 0) return { ok: false, message: '' }

      setProblem(null)
      setRecovery(null)
      if (separateOrderFor.current === user.id) {
        // The visitor said they want another order besides the one that exists: only now is the key
        // of the earlier attempt let go, so that this one is an order of its own.
        forgetCheckoutAttempt(user.id)
      }
      separateOrderFor.current = null
      const outcome = await submitOrder({
        token,
        userId: user.id,
        items: cart,
        values,
        // What the page showed, unless the visitor has since agreed to a new total. The API decides
        // what the order costs; this only stops it from costing something else than was shown.
        expectedTotal: agreedTotal ?? summarizeCart(buildCartLines(cart, products)).total,
      })

      // The visitor signed out, or into another account, while the order was on its way. The answer
      // is the earlier account's: nothing here may touch what the visitor has now: not the cart, not
      // the page they are on, and not their session (an ended one would otherwise sign the new account
      // out). The key of the earlier account's attempt is kept too, even for an order that was placed:
      // that visitor has not seen it, and the cart in their account still holds what they ordered, so
      // when they come back the checkout finds the order by its key instead of ordering again.
      const current = useAuthStore.getState()
      if (current.token !== token || current.user?.id !== user.id) {
        return outcome.ok ? { ok: true } : { ok: false, message: '' }
      }

      if (outcome.ok) {
        // The order exists for the visitor who is here: the attempt is resolved.
        forgetCheckoutAttempt(user.id)
        // Left the page meanwhile: the order exists and the cart is emptied, but the visitor stays
        // where they went instead of being pulled to the confirmation.
        if (mounted.current) {
          navigate(paths.order(outcome.order.orderNumber), {
            replace: true,
            state: { justPlaced: true },
          })
        }
        useCartStore.getState().clear()
        return { ok: true }
      }

      switch (outcome.reason) {
        case 'unauthorized':
          // The session is over: signing out sends the visitor to the login page, and back here.
          useAuthStore.getState().logout()
          return { ok: false, message: 'ההתחברות הסתיימה. התחברו שוב כדי להשלים את ההזמנה.' }
        case 'product-unavailable':
          // About the cart that was sent: if the cart changed while the order was on its way, the
          // visitor is looking at another one, and this says nothing about it.
          if (useCartStore.getState().items === cart) {
            setProblem({ kind: 'unavailable', productIds: outcome.productIds })
          }
          return { ok: false, message: '' }
        case 'price-changed':
          if (useCartStore.getState().items === cart) {
            setProblem({ kind: 'price-changed', total: outcome.total })
            setAgreedTotal(outcome.total)
          }
          return { ok: false, message: '' }
        case 'too-many-requests':
          return { ok: false, message: 'ניסיתם להזמין יותר מדי פעמים. נסו שוב בעוד זמן מה.' }
        case 'invalid-input':
          return { ok: false, message: 'השרת לא קיבל את פרטי ההזמנה. בדקו את הפרטים ונסו שוב.' }
        case 'key-reused':
          // An earlier attempt made an order, and these details are not that order: nothing new was
          // placed. Show the order that exists. An older API does not name it: say that it cannot be
          // verified and point to the orders. The key is kept either way.
          setRecovery(
            outcome.orderNumber
              ? { kind: 'placed', orderNumber: outcome.orderNumber, submitted: true }
              : { kind: 'unverified' },
          )
          return { ok: false, message: '' }
        case 'unavailable':
          return {
            ok: false,
            message:
              'לא הצלחנו להשלים את ההזמנה. בדקו את החיבור ונסו שוב. אם ההזמנה כבר נשלחה, לא תיווצר הזמנה כפולה.',
          }
      }
    }

  const notice = (products: readonly Product[]) => (controls: { submit: () => void }) => (
    <>
      {recovery && (
        <OrderAttemptNotice
          recovery={recovery}
          onConfirmSeparateOrder={() => {
            separateOrderFor.current = userId ?? null
            setRecovery(null)
            controls.submit()
          }}
        />
      )}
      {problemNotice(products)}
    </>
  )

  const problemNotice = (products: readonly Product[]) => {
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

      <ProductsBoundary ids={items.map((item) => item.productId)} loading={<CheckoutSkeleton />}>
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
                  זו הזמנת הדגמה בלבד: לא מתבצע תשלום אמיתי ולא יישלח שום מוצר. הכתובת נבדקת רק לפי
                  הפורמט, ולא נבדק שהיא קיימת. ההזמנה ופרטי המשלוח נשמרים בחשבון שלכם בשרת האתר, לכן
                  אל תזינו פרטים אמיתיים שאינכם רוצים שיישמרו.
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
      </ProductsBoundary>
    </>
  )
}
