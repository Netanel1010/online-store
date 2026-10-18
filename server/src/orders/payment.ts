import {
  MAX_PAYMENT_ATTEMPTS,
  type AttemptStatus,
  type PaymentScenario,
  type PaymentState,
  type PublicPayment,
} from '../../../src/features/orders/payment.ts'

export { MAX_PAYMENT_ATTEMPTS }

/**
 * The simulated payment of a demo order: what is stored, and the rules that change it
 * (docs/adr/0014-demo-payment-state-machine.md). Nothing here talks to a database or knows about HTTP,
 * and nothing reads a clock: every function is given the time to decide at, which the service takes
 * from the database (`$$NOW`), never from the process.
 *
 * What is stored are facts: an attempt was started with a scenario at a time, it was decided, the order
 * was paid, refunded or ran out of time. A fact that depends on time (an attempt that the provider has
 * decided by now, an order whose time is up) is due from a stored deadline and is stored before anyone
 * is told about it, so a result that was shown can never be undone by a later request or a slower clock.
 */

/** One attempt to pay, as stored. Its number, key, scenario and times never change once it is stored. */
export interface StoredAttempt {
  number: number
  /** The `Idempotency-Key` of the request that started it: a repeat of that request is this attempt. */
  idempotencyKey: string
  scenario: PaymentScenario
  createdAt: Date
  settlesAt: Date
  timeoutAt: Date
  status: AttemptStatus
  settledAt?: Date
  cancelledBy?: 'visitor' | 'provider'
  ignoredConfirmations: number
}

/** The payment of an order, as stored with it. Orders placed before payments existed have none. */
export interface StoredPayment {
  /** Raised by every write, which only succeeds against the version it read (compare and set). */
  version: number
  state: PaymentState
  expiresAt: Date
  /** The timings of this order, stored when it was placed: a later change of settings never moves it. */
  settleDelayMs: number
  attemptTimeoutMs: number
  attempts: StoredAttempt[]
  paidAt?: Date
  refundedAt?: Date
}

/** How long the fictional provider takes, and how long an order waits to be paid, in milliseconds. */
export interface PaymentTimings {
  settleDelayMs: number
  attemptTimeoutMs: number
  expiryMs: number
}

export const DEMO_PAYMENT_TIMINGS: PaymentTimings = {
  settleDelayMs: 3_000,
  attemptTimeoutMs: 20_000,
  expiryMs: 30 * 60 * 1000,
}

/** Throws unless `0 < settle < timeout < expiry`, in whole milliseconds. */
export function checkTimings({ settleDelayMs, attemptTimeoutMs, expiryMs }: PaymentTimings) {
  const whole = [settleDelayMs, attemptTimeoutMs, expiryMs].every(
    (value) => Number.isSafeInteger(value) && value > 0,
  )
  if (!whole || !(settleDelayMs < attemptTimeoutMs && attemptTimeoutMs < expiryMs)) {
    throw new Error('Payment timings must be whole milliseconds with 0 < settle < timeout < expiry')
  }
}

const plus = (time: Date, milliseconds: number) => new Date(time.getTime() + milliseconds)

/** The payment of an order that was just placed, with the timings it keeps for its whole life. */
export function initialPayment(createdAt: Date, timings: PaymentTimings): StoredPayment {
  return {
    version: 0,
    state: 'awaiting',
    expiresAt: plus(createdAt, timings.expiryMs),
    settleDelayMs: timings.settleDelayMs,
    attemptTimeoutMs: timings.attemptTimeoutMs,
    attempts: [],
  }
}

/** The last moment a new attempt may start: one that starts then still ends by the order's time. */
export const attemptsOpenUntil = (payment: StoredPayment) =>
  plus(payment.expiresAt, -payment.attemptTimeoutMs)

/** Which stored time decides an attempt: its timeout when the provider never answers. */
export const deadlineField = (attempt: Pick<StoredAttempt, 'scenario'>) =>
  attempt.scenario === 'no_answer' ? ('timeoutAt' as const) : ('settlesAt' as const)

// The fictional provider -------------------------------------------------------------------------

/** What the provider tells the store about an attempt. `id` is the same for a message sent twice. */
export interface Confirmation {
  id: string
  outcome: 'approved' | 'declined' | 'provider_cancelled'
}

/**
 * What the fictional provider sends about an attempt, all at its `settlesAt`, worked out from the stored
 * scenario alone: the client chose the scenario once, when it started the attempt, and nothing it sends
 * later can change it. `duplicate_approval` sends the same approval twice; `no_answer` sends nothing.
 * An attempt the visitor cancelled first is never confirmed: the cancellation is passed on.
 */
export function confirmationsFor(orderNumber: string, attempt: StoredAttempt): Confirmation[] {
  const message = (outcome: Confirmation['outcome']): Confirmation => ({
    id: `${orderNumber}/${attempt.number}/${outcome}`,
    outcome,
  })
  switch (attempt.scenario) {
    case 'approve':
      return [message('approved')]
    case 'duplicate_approval':
      return [message('approved'), message('approved')]
    case 'decline':
      return [message('declined')]
    case 'provider_cancel':
      return [message('provider_cancelled')]
    case 'no_answer':
      return []
  }
}

/**
 * What the store does with the provider's messages about one attempt that is still processing: the
 * first one decides it; one that was already applied (the same id), or that comes after the attempt was
 * decided, changes nothing and is only counted. No message at all means the provider never answered.
 */
export function applyConfirmations(confirmations: readonly Confirmation[]): {
  status: Exclude<AttemptStatus, 'processing'>
  cancelledBy?: 'provider'
  ignoredConfirmations: number
} {
  const applied = new Set<string>()
  let decided: { status: 'succeeded' | 'failed' | 'cancelled'; cancelledBy?: 'provider' } | null =
    null
  let ignoredConfirmations = 0
  for (const confirmation of confirmations) {
    if (decided !== null || applied.has(confirmation.id)) {
      ignoredConfirmations += 1
      continue
    }
    applied.add(confirmation.id)
    decided =
      confirmation.outcome === 'approved'
        ? { status: 'succeeded' }
        : confirmation.outcome === 'declined'
          ? { status: 'failed' }
          : { status: 'cancelled', cancelledBy: 'provider' }
  }
  return decided === null
    ? { status: 'timed_out', ignoredConfirmations }
    : { ...decided, ignoredConfirmations }
}

// Writes ------------------------------------------------------------------------------------------

/**
 * A condition on the database's clock that a write needs, checked by the database when it writes
 * (`$$NOW`), against the stored fields of the document, never against a time the process passes in.
 * `attempt` is the index of the attempt in the stored list.
 */
export type PaymentGuard =
  | { kind: 'atOrAfter'; attempt: number; field: 'settlesAt' | 'timeoutAt' }
  | { kind: 'before'; attempt: number; field: 'settlesAt' | 'timeoutAt' }
  /** The order's time is up: `$$NOW >= expiresAt`. */
  | { kind: 'expired' }
  /** A new attempt still ends in time: `$$NOW + attemptTimeoutMs <= expiresAt`. */
  | { kind: 'startWindow' }

/** What a write expects to find, besides its guards: exactly the payment it read. */
export interface PaymentExpectation {
  version: number
  state: PaymentState
  statuses: AttemptStatus[]
}

export const expectationOf = (payment: StoredPayment): PaymentExpectation => ({
  version: payment.version,
  state: payment.state,
  statuses: payment.attempts.map((attempt) => attempt.status),
})

/** Whether a guard holds at `now` for a stored payment (what the in-memory repository checks). */
export function guardHolds(guard: PaymentGuard, payment: StoredPayment, now: Date): boolean {
  const at = now.getTime()
  switch (guard.kind) {
    case 'atOrAfter': {
      const attempt = payment.attempts[guard.attempt]
      return attempt !== undefined && at >= attempt[guard.field].getTime()
    }
    case 'before': {
      const attempt = payment.attempts[guard.attempt]
      return attempt !== undefined && at < attempt[guard.field].getTime()
    }
    case 'expired':
      return at >= payment.expiresAt.getTime()
    case 'startWindow':
      return at + payment.attemptTimeoutMs <= payment.expiresAt.getTime()
  }
}

/** The latest time the payment records: a new fact is never dated before it. */
export function latestFact(payment: StoredPayment): Date {
  let latest = 0
  for (const attempt of payment.attempts) {
    latest = Math.max(latest, attempt.createdAt.getTime(), attempt.settledAt?.getTime() ?? 0)
  }
  latest = Math.max(latest, payment.paidAt?.getTime() ?? 0, payment.refundedAt?.getTime() ?? 0)
  return new Date(latest)
}

/** The time a request decides at: the database's clock, but never before what is already stored. */
export const commandTime = (payment: StoredPayment, databaseNow: Date) =>
  new Date(Math.max(databaseNow.getTime(), latestFact(payment).getTime()))

/**
 * The changes that are due at `now` and not stored yet: the processing attempt's decision once its
 * deadline has passed, then the end of the order's time if it was not paid. They are returned with the
 * guards a write of them needs, so the database stores them only if they are due by its own clock too.
 * Nothing is due twice: a decided attempt and a paid or expired order are left as they are.
 */
export function settleDue(
  orderNumber: string,
  payment: StoredPayment,
  now: Date,
): { payment: StoredPayment; guards: PaymentGuard[]; changed: boolean } {
  const attempts = payment.attempts.map((attempt) => ({ ...attempt }))
  const guards: PaymentGuard[] = []
  let { state, paidAt } = payment

  const index = attempts.length - 1
  const attempt = attempts[index]
  if (attempt?.status === 'processing') {
    const field = deadlineField(attempt)
    const deadline = attempt[field]
    if (now.getTime() >= deadline.getTime()) {
      const outcome = applyConfirmations(confirmationsFor(orderNumber, attempt))
      attempt.status = outcome.status
      attempt.settledAt = deadline
      attempt.ignoredConfirmations = outcome.ignoredConfirmations
      if (outcome.cancelledBy) attempt.cancelledBy = outcome.cancelledBy
      guards.push({ kind: 'atOrAfter', attempt: index, field })
      if (outcome.status === 'succeeded' && state === 'awaiting') {
        state = 'paid'
        paidAt = deadline
      }
    }
  }

  const processing = attempts.some((candidate) => candidate.status === 'processing')
  if (state === 'awaiting' && !processing && now.getTime() >= payment.expiresAt.getTime()) {
    state = 'expired'
    guards.push({ kind: 'expired' })
  }

  const next: StoredPayment = { ...payment, attempts, state }
  if (paidAt) next.paidAt = paidAt
  return { payment: next, guards, changed: guards.length > 0 }
}

// Commands ------------------------------------------------------------------------------------------

/** Why a command is refused: a status and code for the API, and the details it may say. */
export interface PaymentRefusal {
  status: 404 | 409
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * What a command comes to, decided on the payment the request read and the time it decides at:
 *  - `write`: store `next` (whose version the caller raises) if the payment is still what was read and
 *    `guards` hold by the database's clock;
 *  - `already`: what was asked is already done (a repeat of a request whose answer was lost); the
 *    answer is the payment as it is, once a read of it from the majority shows `done`;
 *  - `refuse`.
 */
export type PaymentDecision =
  | { kind: 'write'; next: StoredPayment; guards: PaymentGuard[]; created: boolean }
  | { kind: 'already'; done: (payment: StoredPayment | undefined) => boolean }
  | { kind: 'refuse'; refusal: PaymentRefusal }

const refuse = (refusal: PaymentRefusal): PaymentDecision => ({ kind: 'refuse', refusal })

const notOpen = (reason: string) =>
  refuse({
    status: 409,
    code: 'payment_not_open',
    message: 'This order cannot be paid now',
    details: { reason },
  })

/**
 * Starts an attempt with a scenario. The key is looked at first, as for orders: the same key with the
 * same scenario is the attempt it made, whatever happened since; with another scenario it is refused.
 * Then the order must be waiting for payment, with no attempt processing, fewer than three attempts,
 * and enough time left for the attempt to end before the order's time: `now + timeout <= expiresAt`,
 * checked here at the time the request decides at and again by the database when it writes.
 */
export function decideStart(
  orderNumber: string,
  payment: StoredPayment | undefined,
  now: Date,
  idempotencyKey: string,
  scenario: PaymentScenario,
): PaymentDecision {
  if (!payment) return notOpen('legacy')

  const made = payment.attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey)
  if (made) {
    if (made.scenario !== scenario) {
      return refuse({
        status: 409,
        code: 'idempotency_key_reuse',
        message: 'This Idempotency-Key was already used for a different attempt',
        details: { attemptNumber: made.number },
      })
    }
    return {
      kind: 'already',
      done: (stored) =>
        stored?.attempts.some((attempt) => attempt.idempotencyKey === idempotencyKey) ?? false,
    }
  }

  const due = settleDue(orderNumber, payment, now)
  const base = due.payment
  if (base.state !== 'awaiting') return notOpen(base.state)
  if (base.attempts.some((attempt) => attempt.status === 'processing')) {
    return refuse({
      status: 409,
      code: 'payment_attempt_active',
      message: 'An attempt to pay this order is still processing',
    })
  }
  if (base.attempts.length >= MAX_PAYMENT_ATTEMPTS) {
    return refuse({
      status: 409,
      code: 'payment_attempts_exhausted',
      message: 'This order has had as many attempts as it may have',
    })
  }
  if (now.getTime() + base.attemptTimeoutMs > base.expiresAt.getTime()) return notOpen('closing')

  const attempt: StoredAttempt = {
    number: base.attempts.length + 1,
    idempotencyKey,
    scenario,
    createdAt: now,
    settlesAt: plus(now, base.settleDelayMs),
    timeoutAt: plus(now, base.attemptTimeoutMs),
    status: 'processing',
    ignoredConfirmations: 0,
  }
  return {
    kind: 'write',
    next: { ...base, attempts: [...base.attempts, attempt] },
    guards: [...due.guards, { kind: 'startWindow' }],
    created: true,
  }
}

const attemptNotFound = () =>
  refuse({ status: 404, code: 'payment_attempt_not_found', message: 'The attempt was not found' })

/**
 * The visitor cancels an attempt that is still processing: only before the provider decides it
 * (`now < deadline`, here and by the database's clock when it writes). At the deadline the provider
 * comes first. Cancelling an attempt the visitor already cancelled is that cancellation again.
 */
export function decideCancel(
  orderNumber: string,
  payment: StoredPayment | undefined,
  now: Date,
  attemptNumber: number,
): PaymentDecision {
  const index = attemptNumber - 1
  if (!payment || payment.attempts[index] === undefined) return attemptNotFound()

  const due = settleDue(orderNumber, payment, now)
  const attempt = due.payment.attempts[index]!
  if (attempt.status === 'cancelled' && attempt.cancelledBy === 'visitor') {
    return {
      kind: 'already',
      done: (stored) => {
        const found = stored?.attempts[index]
        return found?.status === 'cancelled' && found.cancelledBy === 'visitor'
      },
    }
  }
  if (attempt.status !== 'processing') {
    return refuse({
      status: 409,
      code: 'payment_attempt_settled',
      message: 'The attempt was already decided',
      details: { status: attempt.status },
    })
  }

  const attempts = due.payment.attempts.map((candidate, position) =>
    position === index
      ? {
          ...candidate,
          status: 'cancelled' as const,
          settledAt: now,
          cancelledBy: 'visitor' as const,
        }
      : candidate,
  )
  return {
    kind: 'write',
    next: { ...due.payment, attempts },
    guards: [...due.guards, { kind: 'before', attempt: index, field: deadlineField(attempt) }],
    created: false,
  }
}

/** A full, simulated refund of a paid order, once. Asking again for a refunded order is that refund. */
export function decideRefund(
  orderNumber: string,
  payment: StoredPayment | undefined,
  now: Date,
): PaymentDecision {
  const notAllowed = (state: string) =>
    refuse({
      status: 409,
      code: 'refund_not_allowed',
      message: 'Only a paid order can be refunded',
      details: { state },
    })
  if (!payment) return notAllowed('legacy')

  const due = settleDue(orderNumber, payment, now)
  if (due.payment.state === 'refunded') {
    return { kind: 'already', done: (stored) => stored?.state === 'refunded' }
  }
  if (due.payment.state !== 'paid') return notAllowed(due.payment.state)
  return {
    kind: 'write',
    next: { ...due.payment, state: 'refunded', refundedAt: now },
    guards: due.guards,
    created: false,
  }
}

// What the API shows ---------------------------------------------------------------------------------

/**
 * The payment as the API shows it: the stored facts, in canonical times, and what is derived from them.
 * It shows only what is stored, never a decision that is due but not stored; `pendingUpdate` says that
 * one is due at `now`, so a list can tell the visitor to open the order (opening it stores it).
 */
export function toPublicPayment(
  orderNumber: string,
  payment: StoredPayment | undefined,
  now?: Date,
): PublicPayment | null {
  if (!payment) return null
  const view: PublicPayment = {
    state: payment.state,
    expiresAt: payment.expiresAt.toISOString(),
    attemptsOpenUntil: attemptsOpenUntil(payment).toISOString(),
    attemptsLeft: MAX_PAYMENT_ATTEMPTS - payment.attempts.length,
    pendingUpdate: now ? settleDue(orderNumber, payment, now).changed : false,
    attempts: payment.attempts.map((attempt) => ({
      number: attempt.number,
      scenario: attempt.scenario,
      createdAt: attempt.createdAt.toISOString(),
      settlesAt: attempt.settlesAt.toISOString(),
      timeoutAt: attempt.timeoutAt.toISOString(),
      status: attempt.status,
      ...(attempt.settledAt && { settledAt: attempt.settledAt.toISOString() }),
      ...(attempt.cancelledBy && { cancelledBy: attempt.cancelledBy }),
      ignoredConfirmations: attempt.ignoredConfirmations,
    })),
  }
  if (payment.paidAt) view.paidAt = payment.paidAt.toISOString()
  if (payment.refundedAt) view.refundedAt = payment.refundedAt.toISOString()
  return view
}
