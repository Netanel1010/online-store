import type { ReactNode } from 'react'
import { formatPrice } from '@/lib/format'
import type { CartSummary } from './summary'

/** Totals are always derived from the cart lines and the catalog, never stored. */
export function OrderSummary({
  summary,
  children,
}: {
  summary: CartSummary
  /** Optional actions shown under the totals, such as the checkout button. */
  children?: ReactNode
}) {
  return (
    <aside
      aria-labelledby="order-summary-heading"
      className="rounded-xl border border-line bg-white p-5 shadow-sm lg:sticky lg:top-40"
    >
      <h2 id="order-summary-heading" className="text-lg font-bold">
        סיכום הזמנה
      </h2>

      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">מספר פריטים</dt>
          <dd>{summary.itemCount}</dd>
        </div>
        {summary.savings > 0 && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">מחיר לפני הנחות</dt>
              <dd>
                <del>{formatPrice(summary.originalTotal)}</del>
              </dd>
            </div>
            <div className="flex justify-between gap-4 text-sale">
              <dt>חיסכון</dt>
              <dd>{formatPrice(summary.savings)}</dd>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between gap-4 border-t border-line pt-3 text-lg font-bold">
          <dt>סה&quot;כ</dt>
          <dd className="text-2xl">{formatPrice(summary.total)}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-muted">
        באתר ההדגמה לא מחושבים משלוח ומע&quot;מ, ולא מתבצע תשלום.
      </p>
      {children && <div className="mt-5">{children}</div>}
    </aside>
  )
}
