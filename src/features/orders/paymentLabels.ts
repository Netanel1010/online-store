import type { AttemptStatus, PaymentScenario, PaymentState, PublicPayment } from './payment'

/**
 * The words of the simulated payment, in one place for the order page and the list of orders. Every
 * one that could read as real money says that it is simulated.
 */

/** The standing sentence of the payment: there is no money, no card and no product. */
export const SIMULATED_PAYMENT_NOTICE =
  'תשלום מדומה: לא נגבה כסף, לא נדרשים פרטי כרטיס, ולא יישלח מוצר.'

export const SCENARIO_LABEL: Record<PaymentScenario, string> = {
  approve: 'תשלום מאושר',
  decline: 'תשלום נדחה',
  no_answer: 'הספק לא עונה',
  provider_cancel: 'ביטול אצל הספק',
  duplicate_approval: 'אישור כפול מהספק',
}

/** The order in which the visitor is offered the scenarios. */
export const SCENARIO_ORDER: readonly PaymentScenario[] = [
  'approve',
  'decline',
  'no_answer',
  'provider_cancel',
  'duplicate_approval',
]

export const ATTEMPT_STATUS_LABEL: Record<AttemptStatus, string> = {
  processing: 'בעיבוד',
  succeeded: 'שולם (מדומה)',
  failed: 'נכשל',
  cancelled: 'בוטל',
  timed_out: 'פג הזמן',
}

const STATE_LABEL: Record<PaymentState, string> = {
  awaiting: 'ממתין לתשלום',
  paid: 'שולם (מדומה)',
  refunded: 'הוחזר (מדומה)',
  expired: 'פג זמן התשלום',
}

/** Where the payment stands, in a few words: an attempt that is processing comes first. */
export function paymentStateLabel(payment: PublicPayment): string {
  const processing = payment.attempts.some((attempt) => attempt.status === 'processing')
  return processing ? ATTEMPT_STATUS_LABEL.processing : STATE_LABEL[payment.state]
}

export const LEGACY_ORDER_LABEL = 'הזמנת הדגמה מלפני שנוסף התשלום המדומה'
export const DUPLICATE_APPROVAL_NOTE = 'הספק שלח את האישור פעמיים. השני לא שינה דבר.'
export const CLOSING_NOTE = 'לא ניתן להתחיל תשלום חדש: זמן התשלום מסתיים.'
export const OPEN_TO_UPDATE = 'פתחו את ההזמנה לעדכון המצב'
export const INCONSISTENT_NOTE =
  'מצב התשלום של ההזמנה הזו לא עקבי. רעננו את הדף. אם זה חוזר, זו תקלה.'
