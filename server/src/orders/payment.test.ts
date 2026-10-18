import { describe, expect, it } from 'vitest'
import {
  comparePayments,
  isWellFormedPayment,
  PAYMENT_SCENARIOS,
  paymentAtMost,
  type PaymentScenario,
} from '../../../src/features/orders/payment.ts'
import {
  applyConfirmations,
  attemptsOpenUntil,
  checkTimings,
  commandTime,
  confirmationsFor,
  decideCancel,
  decideRefund,
  decideStart,
  DEMO_PAYMENT_TIMINGS,
  guardHolds,
  initialPayment,
  settleDue,
  toPublicPayment,
  type PaymentDecision,
  type StoredPayment,
} from './payment.ts'

const ORDER = 'DEMO-7K2M9QX4'
const PLACED = new Date('2026-10-20T10:00:00.000Z')
/** Short timings, so the numbers in the tests are easy to follow: settle 50, timeout 200, expiry 1000. */
const SHORT = { settleDelayMs: 50, attemptTimeoutMs: 200, expiryMs: 1000 }
const at = (ms: number) => new Date(PLACED.getTime() + ms)
const E = 1000

const fresh = () => initialPayment(PLACED, SHORT)

function written(decision: PaymentDecision) {
  if (decision.kind !== 'write') throw new Error(`expected a write, got ${decision.kind}`)
  return decision
}
function refused(decision: PaymentDecision) {
  if (decision.kind !== 'refuse') throw new Error(`expected a refusal, got ${decision.kind}`)
  return decision.refusal
}
/** The payment after a write, as the service stores it: the version raised once. */
const store = (payment: StoredPayment, decision: PaymentDecision): StoredPayment => ({
  ...written(decision).next,
  version: payment.version + 1,
})

/** A payment with one attempt of `scenario` started at `startedAt`. */
function withAttempt(scenario: PaymentScenario, startedAt = 0, key = 'key-0000000000000001') {
  const payment = fresh()
  return store(payment, decideStart(ORDER, payment, at(startedAt), key, scenario))
}

describe('the timings', () => {
  it('accepts whole milliseconds with settle < timeout < expiry, and refuses anything else', () => {
    expect(() => checkTimings(DEMO_PAYMENT_TIMINGS)).not.toThrow()
    expect(() => checkTimings(SHORT)).not.toThrow()
    for (const bad of [
      { ...SHORT, settleDelayMs: 0 },
      { ...SHORT, settleDelayMs: 200 },
      { ...SHORT, attemptTimeoutMs: 1000 },
      { ...SHORT, settleDelayMs: 1.5 },
      { ...SHORT, expiryMs: Number.MAX_SAFE_INTEGER + 2 },
    ]) {
      expect(() => checkTimings(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('are the agreed demo values: 3 seconds, 20 seconds and 30 minutes', () => {
    expect(DEMO_PAYMENT_TIMINGS).toEqual({
      settleDelayMs: 3_000,
      attemptTimeoutMs: 20_000,
      expiryMs: 1_800_000,
    })
  })
})

describe('a new payment', () => {
  it('waits for payment, keeps its timings, and closes for new attempts one timeout before its end', () => {
    const payment = fresh()
    expect(payment).toEqual({
      version: 0,
      state: 'awaiting',
      expiresAt: at(E),
      settleDelayMs: 50,
      attemptTimeoutMs: 200,
      attempts: [],
    })
    expect(attemptsOpenUntil(payment)).toEqual(at(E - 200))
  })
})

describe('the fictional provider', () => {
  it.each([
    ['approve', ['approved']],
    ['decline', ['declined']],
    ['provider_cancel', ['provider_cancelled']],
    ['no_answer', []],
    ['duplicate_approval', ['approved', 'approved']],
  ] as const)('sends, for %s, %j', (scenario, outcomes) => {
    const attempt = withAttempt(scenario).attempts[0]!
    const messages = confirmationsFor(ORDER, attempt)

    expect(messages.map((message) => message.outcome)).toEqual(outcomes)
    for (const message of messages) {
      expect(message.id).toBe(`${ORDER}/1/${message.outcome}`)
    }
  })

  it('decides an attempt by the first message, and counts a repeated or late one without applying it', () => {
    const approved = { id: 'a', outcome: 'approved' as const }
    const declined = { id: 'b', outcome: 'declined' as const }

    expect(applyConfirmations([approved])).toEqual({ status: 'succeeded', ignoredConfirmations: 0 })
    expect(applyConfirmations([approved, approved])).toEqual({
      status: 'succeeded',
      ignoredConfirmations: 1,
    })
    expect(applyConfirmations([approved, declined])).toEqual({
      status: 'succeeded',
      ignoredConfirmations: 1,
    })
    expect(applyConfirmations([declined, approved, approved])).toEqual({
      status: 'failed',
      ignoredConfirmations: 2,
    })
    expect(applyConfirmations([{ id: 'c', outcome: 'provider_cancelled' }])).toEqual({
      status: 'cancelled',
      cancelledBy: 'provider',
      ignoredConfirmations: 0,
    })
    expect(applyConfirmations([])).toEqual({ status: 'timed_out', ignoredConfirmations: 0 })
  })
})

describe('what is due', () => {
  it.each([
    ['approve', 'succeeded', 0],
    ['decline', 'failed', 0],
    ['provider_cancel', 'cancelled', 0],
    ['duplicate_approval', 'succeeded', 1],
  ] as const)(
    'decides %s at its settlesAt, not a millisecond before',
    (scenario, status, ignored) => {
      const payment = withAttempt(scenario, 100)

      expect(settleDue(ORDER, payment, at(149)).changed).toBe(false)
      const due = settleDue(ORDER, payment, at(150))
      expect(due.changed).toBe(true)
      expect(due.payment.attempts[0]).toMatchObject({
        status,
        settledAt: at(150),
        ignoredConfirmations: ignored,
      })
      expect(due.guards).toEqual([{ kind: 'atOrAfter', attempt: 0, field: 'settlesAt' }])
    },
  )

  it('pays the order when the attempt succeeds, at the time of the attempt and not of the request', () => {
    const due = settleDue(ORDER, withAttempt('approve', 100), at(900))

    expect(due.payment.state).toBe('paid')
    expect(due.payment.paidAt).toEqual(at(150))
    expect(due.payment.attempts[0]!.settledAt).toEqual(at(150))
  })

  it('times out an attempt the provider never answers at its timeoutAt, not before', () => {
    const payment = withAttempt('no_answer', 100)

    expect(settleDue(ORDER, payment, at(299)).changed).toBe(false)
    const due = settleDue(ORDER, payment, at(300))
    expect(due.payment.attempts[0]).toMatchObject({ status: 'timed_out', settledAt: at(300) })
    expect(due.guards).toEqual([{ kind: 'atOrAfter', attempt: 0, field: 'timeoutAt' }])
  })

  it('ends an unpaid order at its expiresAt, not before', () => {
    expect(settleDue(ORDER, fresh(), at(E - 1)).changed).toBe(false)
    const due = settleDue(ORDER, fresh(), at(E))
    expect(due.payment.state).toBe('expired')
    expect(due.guards).toEqual([{ kind: 'expired' }])
  })

  it('decides the last attempt before it ends the order, so a success just before the end is a payment', () => {
    // The latest an attempt can start: it ends exactly at the order's time.
    const payment = withAttempt('approve', E - 200)
    const due = settleDue(ORDER, payment, at(E + 5000))

    expect(due.payment.state).toBe('paid')
    expect(due.payment.paidAt).toEqual(at(E - 150))
  })

  it('stores a decided attempt and the end of the order in one change, with both guards', () => {
    const due = settleDue(ORDER, withAttempt('decline', 700), at(E))

    expect(due.payment.attempts[0]!.status).toBe('failed')
    expect(due.payment.state).toBe('expired')
    expect(due.guards).toEqual([
      { kind: 'atOrAfter', attempt: 0, field: 'settlesAt' },
      { kind: 'expired' },
    ])
  })

  it('never ends an order while an attempt is processing, even one stored past its time', () => {
    // The start guards keep an attempt from ending after the order; this pins the rule itself.
    const payment = withAttempt('approve', 100)
    const stretched = {
      ...payment,
      attempts: [{ ...payment.attempts[0]!, settlesAt: at(E + 500), timeoutAt: at(E + 600) }],
    }

    const due = settleDue(ORDER, stretched, at(E + 100))
    expect(due.payment.state).toBe('awaiting')
    expect(due.guards).toEqual([])
  })

  it('has nothing due for a paid, refunded or expired order, or a decided attempt', () => {
    const paid = settleDue(ORDER, withAttempt('approve'), at(60)).payment
    const expired = settleDue(ORDER, fresh(), at(E)).payment

    for (const payment of [paid, expired, { ...paid, state: 'refunded' as const }]) {
      expect(settleDue(ORDER, payment, at(E * 10)).changed).toBe(false)
    }
  })
})

describe('the guards, at the boundaries', () => {
  const payment = withAttempt('approve', 100)

  it('atOrAfter holds from the deadline on; before holds until just before it', () => {
    const settles = { attempt: 0, field: 'settlesAt' as const }
    expect(guardHolds({ kind: 'atOrAfter', ...settles }, payment, at(149))).toBe(false)
    expect(guardHolds({ kind: 'atOrAfter', ...settles }, payment, at(150))).toBe(true)
    expect(guardHolds({ kind: 'before', ...settles }, payment, at(149))).toBe(true)
    expect(guardHolds({ kind: 'before', ...settles }, payment, at(150))).toBe(false)
  })

  it('expired holds from expiresAt; startWindow holds until expiresAt minus the timeout', () => {
    expect(guardHolds({ kind: 'expired' }, payment, at(E - 1))).toBe(false)
    expect(guardHolds({ kind: 'expired' }, payment, at(E))).toBe(true)
    expect(guardHolds({ kind: 'startWindow' }, payment, at(E - 200))).toBe(true)
    expect(guardHolds({ kind: 'startWindow' }, payment, at(E - 199))).toBe(false)
  })

  it('uses the timeout stored with the order, not the current settings', () => {
    const long = initialPayment(PLACED, DEMO_PAYMENT_TIMINGS)
    const end = long.expiresAt.getTime() - PLACED.getTime()
    expect(guardHolds({ kind: 'startWindow' }, long, at(end - 20_000))).toBe(true)
    expect(guardHolds({ kind: 'startWindow' }, long, at(end - 19_999))).toBe(false)
  })
})

describe('starting an attempt', () => {
  it('stores the scenario and the times of the order, from the time the request decides at', () => {
    const decision = written(
      decideStart(ORDER, fresh(), at(100), 'key-0000000000000001', 'approve'),
    )

    expect(decision.created).toBe(true)
    expect(decision.next.attempts).toEqual([
      {
        number: 1,
        idempotencyKey: 'key-0000000000000001',
        scenario: 'approve',
        createdAt: at(100),
        settlesAt: at(150),
        timeoutAt: at(300),
        status: 'processing',
        ignoredConfirmations: 0,
      },
    ])
    expect(decision.guards).toEqual([{ kind: 'startWindow' }])
  })

  it('starts at exactly expiresAt minus the timeout, ending at expiresAt, and not a millisecond later', () => {
    const last = written(
      decideStart(ORDER, fresh(), at(E - 200), 'key-0000000000000001', 'approve'),
    )
    expect(last.next.attempts[0]!.timeoutAt).toEqual(at(E))

    expect(
      refused(decideStart(ORDER, fresh(), at(E - 199), 'key-0000000000000001', 'approve')),
    ).toEqual({
      status: 409,
      code: 'payment_not_open',
      message: expect.any(String),
      details: { reason: 'closing' },
    })
  })

  it('gives a repeat of the same request the attempt it made, and refuses the key with another scenario', () => {
    const payment = withAttempt('approve', 0, 'key-0000000000000001')

    const again = decideStart(ORDER, payment, at(500), 'key-0000000000000001', 'approve')
    expect(again.kind).toBe('already')
    if (again.kind === 'already') {
      expect(again.done(payment)).toBe(true)
      expect(again.done(fresh())).toBe(false)
      expect(again.done(undefined)).toBe(false)
    }
    expect(
      refused(decideStart(ORDER, payment, at(500), 'key-0000000000000001', 'decline')),
    ).toMatchObject({ code: 'idempotency_key_reuse', details: { attemptNumber: 1 } })
  })

  it('refuses while an attempt is processing, after three attempts, and for an order that is not waiting', () => {
    expect(
      refused(
        decideStart(ORDER, withAttempt('approve', 0), at(10), 'key-0000000000000002', 'approve'),
      ).code,
    ).toBe('payment_attempt_active')

    let payment = fresh()
    for (const [index, start] of [0, 100, 200].entries()) {
      payment = store(
        payment,
        decideStart(ORDER, payment, at(start), `key-000000000000000${index}`, 'decline'),
      )
    }
    expect(
      refused(decideStart(ORDER, payment, at(400), 'key-0000000000000009', 'approve')).code,
    ).toBe('payment_attempts_exhausted')

    const paid = withAttempt('approve', 0)
    expect(
      refused(decideStart(ORDER, paid, at(60), 'key-0000000000000002', 'approve')).details,
    ).toEqual({ reason: 'paid' })
    expect(
      refused(decideStart(ORDER, fresh(), at(E), 'key-0000000000000002', 'approve')).details,
    ).toEqual({ reason: 'expired' })
    expect(
      refused(decideStart(ORDER, undefined, at(0), 'key-0000000000000002', 'approve')).details,
    ).toEqual({ reason: 'legacy' })
  })

  it('stores the decision of the previous attempt in the same change, with its guard', () => {
    const decision = written(
      decideStart(ORDER, withAttempt('decline', 0), at(60), 'key-0000000000000002', 'approve'),
    )

    expect(decision.next.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'processing',
    ])
    expect(decision.guards).toEqual([
      { kind: 'atOrAfter', attempt: 0, field: 'settlesAt' },
      { kind: 'startWindow' },
    ])
  })
})

describe('cancelling an attempt', () => {
  it('cancels before the provider decides; at the deadline and after, the provider comes first', () => {
    const payment = withAttempt('approve', 100)

    const before = written(decideCancel(ORDER, payment, at(149), 1))
    expect(before.next.attempts[0]).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'visitor',
      settledAt: at(149),
    })
    expect(before.guards).toEqual([{ kind: 'before', attempt: 0, field: 'settlesAt' }])

    for (const time of [150, 151]) {
      expect(refused(decideCancel(ORDER, payment, at(time), 1))).toMatchObject({
        code: 'payment_attempt_settled',
        details: { status: 'succeeded' },
      })
    }
  })

  it('cancels an attempt the provider never answers until its timeoutAt', () => {
    const payment = withAttempt('no_answer', 100)

    expect(written(decideCancel(ORDER, payment, at(299), 1)).guards).toEqual([
      { kind: 'before', attempt: 0, field: 'timeoutAt' },
    ])
    expect(refused(decideCancel(ORDER, payment, at(300), 1)).details).toEqual({
      status: 'timed_out',
    })
  })

  it('is the same cancellation when asked again, and does not know an attempt that does not exist', () => {
    const payment = withAttempt('approve', 100)
    const cancelled = store(payment, decideCancel(ORDER, payment, at(120), 1))

    const again = decideCancel(ORDER, cancelled, at(900), 1)
    expect(again.kind).toBe('already')
    if (again.kind === 'already') {
      expect(again.done(cancelled)).toBe(true)
      expect(again.done(payment)).toBe(false)
    }
    expect(refused(decideCancel(ORDER, payment, at(120), 2)).code).toBe('payment_attempt_not_found')
    expect(refused(decideCancel(ORDER, undefined, at(120), 1)).code).toBe(
      'payment_attempt_not_found',
    )
  })

  it('is never confirmed by the provider afterwards', () => {
    const payment = withAttempt('approve', 100)
    const cancelled = store(payment, decideCancel(ORDER, payment, at(120), 1))

    expect(settleDue(ORDER, cancelled, at(E * 5)).payment.attempts[0]).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'visitor',
      ignoredConfirmations: 0,
    })
  })
})

describe('refunding', () => {
  it('refunds a paid order once, at the time the request decides at', () => {
    const paid = settleDue(ORDER, withAttempt('approve', 0), at(60)).payment
    const decision = written(decideRefund(ORDER, paid, at(700)))

    expect(decision.next.state).toBe('refunded')
    expect(decision.next.refundedAt).toEqual(at(700))
    const refunded = store(paid, decision)
    const again = decideRefund(ORDER, refunded, at(800))
    expect(again.kind).toBe('already')
  })

  it('stores the payment that became due in the same change as the refund', () => {
    const decision = written(decideRefund(ORDER, withAttempt('approve', 0), at(60)))

    expect(decision.next.paidAt).toEqual(at(50))
    expect(decision.guards).toEqual([{ kind: 'atOrAfter', attempt: 0, field: 'settlesAt' }])
  })

  it('refuses an order that is not paid', () => {
    expect(refused(decideRefund(ORDER, fresh(), at(0))).details).toEqual({ state: 'awaiting' })
    expect(refused(decideRefund(ORDER, fresh(), at(E))).details).toEqual({ state: 'expired' })
    expect(refused(decideRefund(ORDER, undefined, at(0))).details).toEqual({ state: 'legacy' })
  })
})

describe('the time a request decides at', () => {
  it('is the database clock, but never before what is already stored (a clock that went back)', () => {
    const payment = store(
      withAttempt('approve', 100),
      decideCancel(ORDER, withAttempt('approve', 100), at(140), 1),
    )

    expect(commandTime(payment, at(500))).toEqual(at(500))
    expect(commandTime(payment, at(120))).toEqual(at(140))
  })
})

describe('the view', () => {
  it('shows stored facts in canonical times, and never a decision that is due but not stored', () => {
    const payment = withAttempt('approve', 100)
    const view = toPublicPayment(ORDER, payment, at(500))!

    expect(view).toEqual({
      state: 'awaiting',
      expiresAt: '2026-10-20T10:00:01.000Z',
      attemptsOpenUntil: '2026-10-20T10:00:00.800Z',
      attemptsLeft: 2,
      pendingUpdate: true,
      attempts: [
        {
          number: 1,
          scenario: 'approve',
          createdAt: '2026-10-20T10:00:00.100Z',
          settlesAt: '2026-10-20T10:00:00.150Z',
          timeoutAt: '2026-10-20T10:00:00.300Z',
          status: 'processing',
          ignoredConfirmations: 0,
        },
      ],
    })
    expect(toPublicPayment(ORDER, payment, at(120))!.pendingUpdate).toBe(false)
    expect(toPublicPayment(ORDER, payment)!.pendingUpdate).toBe(false)
    expect(toPublicPayment(ORDER, undefined)).toBeNull()
    expect(isWellFormedPayment(view)).toBe(true)
  })
})

/** A small seeded generator, so a failing sequence can be run again. */
function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('any sequence of requests and clocks (seeded)', () => {
  // What the repository and the service do, without either: a request reads the payment and the
  // database's clock, decides at the command time, and its write is stored only if the payment is
  // unchanged and the guards hold by the clock at the moment of the write (which may be later, or,
  // after a failover, earlier than the clock it read).
  it.each(Array.from({ length: 40 }, (_, index) => index + 1))(
    'keeps every rule (seed %i)',
    (seed) => {
      const next = random(seed)
      const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!
      let payment = fresh()
      let clock = 0
      let shown = toPublicPayment(ORDER, payment)!
      let keys = 0

      for (let step = 0; step < 60; step += 1) {
        // The clock moves forward, a little or a lot, and sometimes back (a primary with a slower clock).
        clock += next() < 0.1 ? -Math.floor(next() * 80) : Math.floor(next() * 120)
        const readAt = at(clock)
        const now = commandTime(payment, readAt)
        const action = pick(['get', 'get', 'start', 'start', 'cancel', 'refund'] as const)
        let decision: PaymentDecision
        if (action === 'get') {
          const due = settleDue(ORDER, payment, now)
          decision = due.changed
            ? { kind: 'write', next: due.payment, guards: due.guards, created: false }
            : { kind: 'already', done: () => true }
        } else if (action === 'start') {
          decision = decideStart(
            ORDER,
            payment,
            now,
            `key-${String(keys++).padStart(16, '0')}`,
            pick(PAYMENT_SCENARIOS),
          )
        } else if (action === 'cancel') {
          decision = decideCancel(ORDER, payment, now, Math.max(1, payment.attempts.length))
        } else {
          decision = decideRefund(ORDER, payment, now)
        }

        if (decision.kind === 'write') {
          // The write may happen a little after the read, by the database's clock.
          const writeAt = at(clock + Math.floor(next() * 30))
          if (decision.guards.every((guard) => guardHolds(guard, payment, writeAt))) {
            const before = payment
            payment = { ...decision.next, version: before.version + 1 }
            expect(payment.version).toBe(before.version + 1)
          }
        }

        const view = toPublicPayment(ORDER, payment)!
        expect(isWellFormedPayment(view), JSON.stringify(view)).toBe(true)
        expect(
          paymentAtMost(shown, view),
          `${JSON.stringify(shown)} -> ${JSON.stringify(view)}`,
        ).toBe(true)
        expect(comparePayments(shown, view)).toBe('forward')
        expect(
          payment.attempts.filter((attempt) => attempt.status === 'processing').length,
        ).toBeLessThanOrEqual(1)
        expect(
          payment.attempts.filter((attempt) => attempt.status === 'succeeded').length,
        ).toBeLessThanOrEqual(1)
        const lastTimeout = payment.attempts.at(-1)?.timeoutAt.getTime() ?? 0
        expect(lastTimeout).toBeLessThanOrEqual(payment.expiresAt.getTime())
        shown = view
      }
    },
  )
})
