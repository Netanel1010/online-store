import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'

/**
 * What the checkout knows about an earlier attempt that was left unresolved (an answer was lost, the
 * page was reloaded, the details were edited and sent again).
 */
export type AttemptRecovery =
  /**
   * The API has an order from the earlier attempt. `submitted` is true when this is the answer to a
   * request that the visitor just sent with edited details (which was therefore not applied), and
   * false when the checkout found the order by asking, before anything was sent.
   */
  | { kind: 'placed'; orderNumber: string; submitted: boolean }
  /** Nobody can say whether the earlier attempt made an order: the API could not tell. */
  | { kind: 'unverified' }

const BOX = 'space-y-3 rounded-lg border border-sale/30 bg-sale-soft px-4 py-3 text-sm text-sale'

export const SEPARATE_ORDER_QUESTION =
  'האם ליצור הזמנה חדשה? פעולה זו תיצור הזמנה נוספת בנוסף להזמנה שכבר נקלטה.'

interface OrderAttemptNoticeProps {
  recovery: AttemptRecovery
  /**
   * The visitor confirmed, in so many words, that they want another order besides the one that
   * exists. Only then is the key of the earlier attempt let go.
   */
  onConfirmSeparateOrder: () => void
}

/**
 * Tells the visitor, at the top of the checkout, that an order from an earlier attempt may exist,
 * and what they can do: look at it, or (after confirming) place a separate one. It never places an
 * order by itself, and nothing here removes anything from the cart.
 */
export function OrderAttemptNotice({ recovery, onConfirmSeparateOrder }: OrderAttemptNoticeProps) {
  const [confirming, setConfirming] = useState(false)
  const questionRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (confirming) questionRef.current?.focus()
  }, [confirming])

  if (recovery.kind === 'unverified') {
    return (
      <div role="alert" className={BOX}>
        <p>
          לא הצלחנו לבדוק אם ההזמנה הקודמת שלכם נקלטה. לפני שתשלחו שוב, בדקו ב
          <Link to={paths.orders} className="font-semibold underline">
            &quot;ההזמנות שלי&quot;
          </Link>
          . שליחה חוזרת לא תיצור הזמנה כפולה.
        </p>
      </div>
    )
  }

  return (
    <div role="alert" className={BOX}>
      <p>
        נראה שההזמנה הקודמת שלכם כבר נקלטה (מספר <strong dir="ltr">{recovery.orderNumber}</strong>).
        ההזמנה נשמרה עם הפרטים הקודמים, ואי אפשר לעדכן הזמנה קיימת.{' '}
        {recovery.submitted
          ? 'כדי לא ליצור הזמנה כפולה, לא שלחנו את הפרטים החדשים.'
          : 'כדי לא ליצור הזמנה כפולה, בדקו אותה לפני שתמשיכו.'}
      </p>

      {confirming ? (
        <div role="group" aria-label="אישור יצירת הזמנה נוספת" className="space-y-3">
          <p ref={questionRef} tabIndex={-1} className="font-semibold">
            {SEPARATE_ORDER_QUESTION}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onConfirmSeparateOrder}>
              כן, ליצור הזמנה חדשה
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConfirming(false)}
            >
              ביטול
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Link
            to={paths.order(recovery.orderNumber)}
            className={buttonStyles({ variant: 'secondary', size: 'sm' })}
          >
            הצגת ההזמנה
          </Link>
          <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(true)}>
            הזמנה נפרדת בפרטים שהזנתי עכשיו
          </Button>
        </div>
      )}
    </div>
  )
}
