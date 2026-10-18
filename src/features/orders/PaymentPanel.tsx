import { FormAlert, StatusNotice } from '@/components/shared/Notices'
import { Button } from '@/components/ui/Button'
import { readPayment, type Order } from './orderSchema'
import type { PublicAttempt, PublicPayment } from './payment'
import {
  ATTEMPT_STATUS_LABEL,
  CLOSING_NOTE,
  DUPLICATE_APPROVAL_NOTE,
  INCONSISTENT_NOTE,
  LEGACY_ORDER_LABEL,
  paymentStateLabel,
  SCENARIO_LABEL,
  SCENARIO_ORDER,
  SIMULATED_PAYMENT_NOTICE,
} from './paymentLabels'
import type { OrderPayment } from './useOrder'

const FEEDBACK: Record<NonNullable<OrderPayment['feedback']>, string> = {
  unavailable: 'אי אפשר להתחבר לשרת כרגע. ההזמנה לא נפגעה. נסו שוב בעוד רגע.',
  'too-many-requests': 'בוצעו יותר מדי פעולות תשלום. נסו שוב מאוחר יותר.',
}

function Attempt({ attempt }: { attempt: PublicAttempt }) {
  return (
    <li>
      ניסיון {attempt.number}: {SCENARIO_LABEL[attempt.scenario]} ·{' '}
      <span className="font-semibold">{ATTEMPT_STATUS_LABEL[attempt.status]}</span>
      {attempt.ignoredConfirmations > 0 && (
        <span className="block text-muted">{DUPLICATE_APPROVAL_NOTE}</span>
      )}
    </li>
  )
}

/** What the visitor may do now, from the payment as the server answered it. */
function Actions({
  payment,
  actions,
  now,
}: {
  payment: PublicPayment
  actions: OrderPayment
  now: number
}) {
  const processing = payment.attempts.find((attempt) => attempt.status === 'processing')
  if (processing) {
    return (
      <Button
        variant="secondary"
        disabled={actions.busy}
        onClick={() => actions.cancel(processing.number)}
      >
        בטל
      </Button>
    )
  }
  if (payment.state === 'paid') {
    return (
      <Button variant="secondary" disabled={actions.busy} onClick={actions.refund}>
        החזר כספי מדומה
      </Button>
    )
  }
  if (payment.state !== 'awaiting' || payment.attemptsLeft === 0) return null
  // The server decides whether an attempt may still start; this only spares the visitor a refusal.
  if (now >= Date.parse(payment.attemptsOpenUntil)) return <p>{CLOSING_NOTE}</p>

  const heading = payment.attempts.length === 0 ? 'בחרו מה יקרה בתשלום המדומה' : 'לנסות שוב'
  return (
    <fieldset>
      <legend className="mb-2 font-semibold">{heading}</legend>
      <div className="flex flex-wrap gap-2">
        {SCENARIO_ORDER.map((scenario) => (
          <Button
            key={scenario}
            variant="secondary"
            size="sm"
            disabled={actions.busy}
            onClick={() => actions.start(scenario)}
          >
            {SCENARIO_LABEL[scenario]}
          </Button>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * The simulated payment of an order. Everything it shows is what the server answered (the visitor's
 * choice of scenario is never shown as a result), and it says on its own that nothing is charged.
 * When two answers contradicted each other it shows nothing about the payment and offers no action,
 * only a reload.
 */
export function PaymentPanel({
  order,
  payment: actions,
  now,
}: {
  order: Order
  payment: OrderPayment
  /** The time on the visitor's clock, only to hide a start the server would refuse anyway. */
  now: number
}) {
  const read = readPayment(order)

  return (
    <section
      aria-labelledby="payment-heading"
      className="space-y-4 rounded-xl border border-line bg-white p-5"
    >
      <h2 id="payment-heading" className="text-lg font-bold">
        תשלום מדומה
      </h2>
      <p className="text-sm">{SIMULATED_PAYMENT_NOTICE}</p>

      {actions.inconsistent || read.kind === 'malformed' ? (
        <>
          <FormAlert>{INCONSISTENT_NOTE}</FormAlert>
          <Button variant="secondary" onClick={actions.reload}>
            רענון
          </Button>
        </>
      ) : read.kind === 'legacy' ? (
        <p>{LEGACY_ORDER_LABEL}</p>
      ) : (
        <>
          <StatusNotice>{paymentStateLabel(read.payment)}</StatusNotice>
          {read.payment.attempts.length > 0 && (
            <ol aria-label="ניסיונות התשלום" className="space-y-1 text-sm">
              {read.payment.attempts.map((attempt) => (
                <Attempt key={attempt.number} attempt={attempt} />
              ))}
            </ol>
          )}
          {actions.waitingTooLong && (
            <div className="flex flex-wrap items-center gap-3">
              <p>לא התקבלה תשובה.</p>
              <Button variant="secondary" size="sm" onClick={actions.reload}>
                רענון
              </Button>
            </div>
          )}
          <Actions payment={read.payment} actions={actions} now={now} />
          {actions.feedback && <FormAlert>{FEEDBACK[actions.feedback]}</FormAlert>}
        </>
      )}
    </section>
  )
}
