import { z } from 'zod'

/**
 * The simulated payment of a demo order, as the API shows it, in one place for the API that writes it
 * and the storefront that reads it. Nothing is charged: the visitor picks what the fictional provider
 * will do (a closed list of scenarios, no card field), and the server decides everything else from what
 * it stored and from the database's clock. This file has no imports but zod, so the API (server/) can use
 * it as it is.
 *
 * It also holds the two checks the storefront makes before it shows a payment: that one answer is
 * consistent with itself (`isWellFormedPayment`), and how a newer answer relates to the one on screen
 * (`comparePayments`): the same or later, an older one that was read from a lagging copy, or one that
 * contradicts it. The server's own tests hold every view it makes to the same checks.
 */

export const PAYMENT_SCENARIOS = [
  'approve',
  'decline',
  'provider_cancel',
  'no_answer',
  'duplicate_approval',
] as const
export type PaymentScenario = (typeof PAYMENT_SCENARIOS)[number]

export const ATTEMPT_STATUSES = [
  'processing',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
] as const
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number]

export const PAYMENT_STATES = ['awaiting', 'paid', 'refunded', 'expired'] as const
export type PaymentState = (typeof PAYMENT_STATES)[number]

/** How many attempts one order may have. */
export const MAX_PAYMENT_ATTEMPTS = 3

/** The only form a time has in a payment: `Date.prototype.toISOString()`, UTC, with milliseconds. */
export const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const timestamp = z
  .string()
  .regex(CANONICAL_TIMESTAMP)
  .refine((value) => {
    const time = Date.parse(value)
    return !Number.isNaN(time) && new Date(time).toISOString() === value
  })

const attemptSchema = z.object({
  number: z.number().int().min(1).max(MAX_PAYMENT_ATTEMPTS),
  scenario: z.enum(PAYMENT_SCENARIOS),
  createdAt: timestamp,
  settlesAt: timestamp,
  timeoutAt: timestamp,
  status: z.enum(ATTEMPT_STATUSES),
  settledAt: timestamp.optional(),
  cancelledBy: z.enum(['visitor', 'provider']).optional(),
  ignoredConfirmations: z.number().int().min(0),
})

/** The shape of `payment` in an order. Whether it is consistent is `isWellFormedPayment`. */
export const publicPaymentSchema = z.object({
  state: z.enum(PAYMENT_STATES),
  expiresAt: timestamp,
  attemptsOpenUntil: timestamp,
  attemptsLeft: z.number().int().min(0).max(MAX_PAYMENT_ATTEMPTS),
  paidAt: timestamp.optional(),
  refundedAt: timestamp.optional(),
  /** A change is due that the server has not recorded yet: open the order to have it recorded. */
  pendingUpdate: z.boolean(),
  attempts: z.array(attemptSchema).max(MAX_PAYMENT_ATTEMPTS),
})

export type PublicAttempt = z.infer<typeof attemptSchema>
export type PublicPayment = z.infer<typeof publicPaymentSchema>

const ms = (value: string) => Date.parse(value)
const sameTime = (a: string | undefined, b: string | undefined) =>
  a === undefined || b === undefined ? a === b : ms(a) === ms(b)

/** The time an attempt is decided by the provider: its timeout when the provider never answers. */
export const deadlineOf = (attempt: Pick<PublicAttempt, 'scenario' | 'settlesAt' | 'timeoutAt'>) =>
  attempt.scenario === 'no_answer' ? attempt.timeoutAt : attempt.settlesAt

/** The end state an attempt reaches when nobody cancels it, by its scenario. */
function providerOutcome(attempt: PublicAttempt): {
  status: AttemptStatus
  settledAt: string
  cancelledBy?: 'provider'
  ignoredConfirmations: number
} {
  switch (attempt.scenario) {
    case 'approve':
      return { status: 'succeeded', settledAt: attempt.settlesAt, ignoredConfirmations: 0 }
    case 'duplicate_approval':
      return { status: 'succeeded', settledAt: attempt.settlesAt, ignoredConfirmations: 1 }
    case 'decline':
      return { status: 'failed', settledAt: attempt.settlesAt, ignoredConfirmations: 0 }
    case 'provider_cancel':
      return {
        status: 'cancelled',
        settledAt: attempt.settlesAt,
        cancelledBy: 'provider',
        ignoredConfirmations: 0,
      }
    case 'no_answer':
      return { status: 'timed_out', settledAt: attempt.timeoutAt, ignoredConfirmations: 0 }
  }
}

/** W3 and W4: a processing attempt has no outcome yet; a decided one has the outcome of its scenario. */
function attemptIsConsistent(attempt: PublicAttempt): boolean {
  if (attempt.status === 'processing') {
    return (
      attempt.settledAt === undefined &&
      attempt.cancelledBy === undefined &&
      attempt.ignoredConfirmations === 0
    )
  }
  if (attempt.status === 'cancelled' && attempt.cancelledBy === 'visitor') {
    return (
      attempt.settledAt !== undefined &&
      ms(attempt.createdAt) <= ms(attempt.settledAt) &&
      ms(attempt.settledAt) < ms(deadlineOf(attempt)) &&
      attempt.ignoredConfirmations === 0
    )
  }
  const outcome = providerOutcome(attempt)
  return (
    attempt.status === outcome.status &&
    sameTime(attempt.settledAt, outcome.settledAt) &&
    attempt.cancelledBy === outcome.cancelledBy &&
    attempt.ignoredConfirmations === outcome.ignoredConfirmations
  )
}

/**
 * Whether one payment is consistent with itself (W1 to W6 of ADR 0014): the attempts are numbered in
 * order, their times are in order and within the order's time, only the last one may still be
 * processing, a decided attempt has the outcome its scenario gives, the state of the order matches its
 * attempts, and the facts derived from others (`paidAt`, `refundedAt`, `attemptsLeft`, the window for
 * a new attempt) are what they are derived from. The server never makes a payment that is not.
 */
export function isWellFormedPayment(payment: PublicPayment): boolean {
  const expiresAt = ms(payment.expiresAt)
  const window = expiresAt - ms(payment.attemptsOpenUntil)
  if (window <= 0) return false
  const { attempts } = payment
  if (payment.attemptsLeft !== MAX_PAYMENT_ATTEMPTS - attempts.length) return false

  let settleDelay: number | undefined
  for (const [index, attempt] of attempts.entries()) {
    const created = ms(attempt.createdAt)
    const settles = ms(attempt.settlesAt)
    const timeout = ms(attempt.timeoutAt)
    if (attempt.number !== index + 1) return false
    if (!(created < settles && settles < timeout && timeout <= expiresAt)) return false
    if (created > ms(payment.attemptsOpenUntil)) return false
    if (timeout - created !== window) return false
    settleDelay ??= settles - created
    if (settles - created !== settleDelay) return false
    if (attempt.status === 'processing' && index !== attempts.length - 1) return false
    if (index > 0) {
      const previous = attempts[index - 1]!
      if (previous.settledAt === undefined || created < ms(previous.settledAt)) return false
    }
    if (!attemptIsConsistent(attempt)) return false
  }

  const succeeded = attempts.filter((attempt) => attempt.status === 'succeeded')
  const processing = attempts.some((attempt) => attempt.status === 'processing')
  switch (payment.state) {
    case 'paid':
    case 'refunded':
      if (succeeded.length !== 1 || processing) return false
      if (!sameTime(payment.paidAt, succeeded[0]!.settledAt)) return false
      break
    case 'awaiting':
      if (succeeded.length !== 0 || payment.paidAt !== undefined) return false
      break
    case 'expired':
      if (succeeded.length !== 0 || processing || payment.paidAt !== undefined) return false
      break
  }
  if (payment.state === 'refunded') {
    if (payment.refundedAt === undefined || ms(payment.refundedAt) < ms(payment.paidAt!)) {
      return false
    }
  } else if (payment.refundedAt !== undefined) {
    return false
  }
  return true
}

/** The order of the states: a payment only ever moves forward along these. */
function stateAtMost(a: PaymentState, b: PaymentState): boolean {
  if (a === b) return true
  if (a === 'awaiting') return true
  return a === 'paid' && b === 'refunded'
}

function attemptAtMost(a: PublicAttempt, b: PublicAttempt): boolean {
  const unchanged =
    a.number === b.number &&
    a.scenario === b.scenario &&
    sameTime(a.createdAt, b.createdAt) &&
    sameTime(a.settlesAt, b.settlesAt) &&
    sameTime(a.timeoutAt, b.timeoutAt)
  if (!unchanged) return false
  if (a.status === 'processing') return true
  return (
    a.status === b.status &&
    sameTime(a.settledAt, b.settledAt) &&
    a.cancelledBy === b.cancelledBy &&
    a.ignoredConfirmations === b.ignoredConfirmations
  )
}

/**
 * Whether `a` is a prefix of `b`: `b` is `a` or what `a` can become. The fixed facts are the same
 * (the order's times, and each attempt's number, scenario and times, compared by position), the state
 * has not moved back, no attempt is missing, and what was decided is still decided the same way.
 * `pendingUpdate` is advice, not a fact, and is not compared.
 */
export function paymentAtMost(a: PublicPayment, b: PublicPayment): boolean {
  if (!sameTime(a.expiresAt, b.expiresAt) || !sameTime(a.attemptsOpenUntil, b.attemptsOpenUntil)) {
    return false
  }
  if (!stateAtMost(a.state, b.state)) return false
  if (a.attempts.length > b.attempts.length) return false
  if (!a.attempts.every((attempt, index) => attemptAtMost(attempt, b.attempts[index]!))) {
    return false
  }
  if (a.paidAt !== undefined && !sameTime(a.paidAt, b.paidAt)) return false
  if (a.refundedAt !== undefined && !sameTime(a.refundedAt, b.refundedAt)) return false
  return true
}

/**
 * How a newer answer relates to the payment on screen: `forward` (the same, or later: show it), `lag`
 * (older, read from a copy of the database that has not caught up: keep what is shown and ask again)
 * or `contradiction` (neither, or not consistent in itself: something is wrong and nothing should be
 * trusted until the page is reloaded).
 */
export function comparePayments(
  shown: PublicPayment,
  next: PublicPayment,
): 'forward' | 'lag' | 'contradiction' {
  if (!isWellFormedPayment(next)) return 'contradiction'
  if (paymentAtMost(shown, next)) return 'forward'
  if (paymentAtMost(next, shown)) return 'lag'
  return 'contradiction'
}
