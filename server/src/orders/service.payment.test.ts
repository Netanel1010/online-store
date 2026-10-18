import { beforeEach, describe, expect, it } from 'vitest'
import { isWellFormedPayment } from '../../../src/features/orders/payment.ts'
import { HttpError } from '../lib/httpError.ts'
import { createMemoryOrderRepository } from '../testing/memoryOrderRepository.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct } from '../testing/products.ts'
import { DEMO_PAYMENT_TIMINGS, type PaymentTimings } from './payment.ts'
import { createOrderService, MAX_PAYMENT_WRITE_ATTEMPTS } from './service.ts'
import type { Order, PublicOrder } from './types.ts'

// The simulated payment through the order service, over the in-memory repository, which can do what a
// single real MongoDB cannot: a lagging majority, a write that is not confirmed, a rollback, and a
// database clock that moves while a request is between its read and its write, or goes back.
// Names in brackets are the cases of ADR 0014.

const ME = 'user-me'
const KEY = 'order-key-00000000001'
const START = new Date('2026-10-20T10:00:00.000Z')
const at = (ms: number) => new Date(START.getTime() + ms)
/** Settle 50, timeout 200, expiry 1000: the times in these tests are milliseconds after START. */
const SHORT: PaymentTimings = { settleDelayMs: 50, attemptTimeoutMs: 200, expiryMs: 1000 }
const E = 1000

const card = makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 1500 } })
const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '0501234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}
const input = { items: [{ productId: 'GV-N4060', quantity: 1 }], delivery: DELIVERY }

let databaseNow: Date
let appNow: Date
let memory: ReturnType<typeof createMemoryOrderRepository>
let numbers = 0

function service(timings: PaymentTimings = SHORT) {
  return createOrderService({
    orders: memory.repository,
    products: createMemoryProductRepository([card]).repository,
    now: () => appNow,
    generateOrderNumber: () => `DEMO-0000000${(numbers += 1)}`,
    paymentTimings: timings,
  })
}

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('it did not throw')
}

let orders: ReturnType<typeof service>
let number: string

/** The order as it is stored, in the local copy and in the majority's. */
const stored = () => memory.stored.find((order) => order.orderNumber === number)!
const majorityPayment = async () =>
  (await memory.repository.findByOrderNumber(ME, number, { majority: true }))?.payment

const statusOf = (order: PublicOrder, attempt = 0) => order.payment!.attempts[attempt]?.status

beforeEach(async () => {
  databaseNow = START
  appNow = START
  numbers = 0
  memory = createMemoryOrderRepository({ now: () => databaseNow })
  orders = service()
  ;({
    order: { orderNumber: number },
  } = await orders.place(ME, input, KEY))
})

describe('a new order', () => {
  it('is waiting for payment, with the timings it was placed with', () => {
    expect(stored().payment).toEqual({
      version: 0,
      state: 'awaiting',
      expiresAt: at(E),
      settleDelayMs: 50,
      attemptTimeoutMs: 200,
      attempts: [],
    })
  })

  it('refuses timings that cannot work', () => {
    expect(() => service({ settleDelayMs: 200, attemptTimeoutMs: 200, expiryMs: 1000 })).toThrow()
  })
})

describe('a payment from start to end', () => {
  it('is processing, then paid once the provider approves; the decision is stored when the order is read', async () => {
    const started = await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    expect(started.created).toBe(true)
    expect(statusOf(started.order)).toBe('processing')
    expect(isWellFormedPayment(started.order.payment!)).toBe(true)

    databaseNow = at(49)
    expect(statusOf(await orders.get(ME, number))).toBe('processing')
    databaseNow = at(50)
    const paid = await orders.get(ME, number)
    expect(paid.payment).toMatchObject({ state: 'paid', paidAt: at(50).toISOString() })
    // [G1] Stored before it was shown, and confirmed by the majority.
    expect(stored().payment).toMatchObject({ state: 'paid', version: 2 })
    expect((await majorityPayment())!.state).toBe('paid')
    expect(isWellFormedPayment(paid.payment!)).toBe(true)
  })

  it('gives a repeat of the start the same attempt, and refuses the key with another scenario', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')

    const again = await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    expect(again.created).toBe(false)
    expect(again.order.payment!.attempts).toHaveLength(1)
    const reused = await failure(
      orders.startPayment(ME, number, 'pay-key-0000000000001', 'decline'),
    )
    expect(reused).toMatchObject({
      status: 409,
      code: 'idempotency_key_reuse',
      details: { attemptNumber: 1 },
    })
    expect(stored().payment!.attempts).toHaveLength(1)
  })

  it('lets the visitor try again after a decline, and refunds the paid order once', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'decline')
    databaseNow = at(60)
    const second = await orders.startPayment(ME, number, 'pay-key-0000000000002', 'approve')
    expect(second.order.payment!.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'processing',
    ])

    databaseNow = at(200)
    const refunded = await orders.refundPayment(ME, number)
    expect(refunded.payment).toMatchObject({
      state: 'refunded',
      paidAt: at(110).toISOString(),
      refundedAt: at(200).toISOString(),
    })
    databaseNow = at(300)
    const again = await orders.refundPayment(ME, number)
    expect(again.payment!.refundedAt).toBe(at(200).toISOString())
    expect(stored().payment!.refundedAt).toEqual(at(200))
  })

  it('times out an attempt the provider never answers, and ends an unpaid order at its time', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'no_answer')
    databaseNow = at(199)
    expect(statusOf(await orders.get(ME, number))).toBe('processing')
    databaseNow = at(200)
    expect(statusOf(await orders.get(ME, number))).toBe('timed_out')

    databaseNow = at(E - 1)
    expect((await orders.get(ME, number)).payment!.state).toBe('awaiting')
    databaseNow = at(E)
    expect((await orders.get(ME, number)).payment!.state).toBe('expired')
    expect(stored().payment!.state).toBe('expired')
  })

  it('records the second approval of a duplicate as ignored, and pays once', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'duplicate_approval')
    databaseNow = at(50)
    const order = await orders.get(ME, number)

    expect(order.payment!.attempts[0]).toMatchObject({
      status: 'succeeded',
      ignoredConfirmations: 1,
    })
    expect(
      order.payment!.attempts.filter((attempt) => attempt.status === 'succeeded'),
    ).toHaveLength(1)
  })

  it('cancels before the provider decides, and not at the deadline', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(49)
    const cancelled = await orders.cancelPayment(ME, number, 1)
    expect(cancelled.payment!.attempts[0]).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'visitor',
    })

    // A second order, cancelled at the deadline.
    const other = await orders.place(ME, input, 'order-key-00000000002')
    databaseNow = at(100)
    await orders.startPayment(ME, other.order.orderNumber, 'pay-key-0000000000003', 'approve')
    databaseNow = at(150)
    const late = await failure(orders.cancelPayment(ME, other.order.orderNumber, 1))
    expect(late).toMatchObject({
      status: 409,
      code: 'payment_attempt_settled',
      details: { status: 'succeeded' },
    })
  })

  it("does not show or change another account's order", async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')

    for (const attempt of [
      orders.get('someone-else', number),
      orders.startPayment('someone-else', number, 'pay-key-0000000000002', 'approve'),
      orders.cancelPayment('someone-else', number, 1),
      orders.refundPayment('someone-else', number),
    ]) {
      expect(await failure(attempt)).toMatchObject({ status: 404, code: 'order_not_found' })
    }
    expect(stored().payment!.attempts).toHaveLength(1)
  })
})

describe('an order placed before payments existed', () => {
  beforeEach(() => {
    delete stored().payment
    memory.controls.commit()
  })

  it('shows no payment and cannot be paid, cancelled or refunded', async () => {
    expect((await orders.get(ME, number)).payment).toBeNull()
    expect(
      await failure(orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')),
    ).toMatchObject({
      status: 409,
      code: 'payment_not_open',
      details: { reason: 'legacy' },
    })
    expect(await failure(orders.cancelPayment(ME, number, 1))).toMatchObject({
      status: 404,
      code: 'payment_attempt_not_found',
    })
    expect(await failure(orders.refundPayment(ME, number))).toMatchObject({
      status: 409,
      code: 'refund_not_allowed',
      details: { state: 'legacy' },
    })
    expect(stored().payment).toBeUndefined()
  })
})

describe('the start boundary, with both guards [K2]', () => {
  it('[K2a] starts at exactly expiresAt minus the timeout, ending at expiresAt', async () => {
    databaseNow = at(E - 200)
    memory.controls.counters.casAttempts = 0

    const started = await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    expect(started.created).toBe(true)
    expect(stored().payment!.attempts[0]).toMatchObject({
      createdAt: at(E - 200),
      timeoutAt: at(E),
    })
    expect(memory.controls.counters.casAttempts).toBe(1)
    expect(stored().payment!.version).toBe(1)
  })

  it('[K2b] the application guard passes, the database guard fails at a later write: no attempt', async () => {
    databaseNow = at(E - 200)
    memory.controls.beforeWrite = () => {
      databaseNow = at(E - 199)
    }
    memory.controls.counters.casAttempts = 0

    const refused = await failure(
      orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve'),
    )
    expect(refused).toMatchObject({
      status: 409,
      code: 'payment_not_open',
      details: { reason: 'closing' },
    })
    expect(memory.controls.counters.casAttempts).toBe(1)
    expect(stored().payment!.attempts).toHaveLength(0)
    expect(stored().payment!.version).toBe(0)
    expect(memory.controls.counters.localModifications).toBe(0)
  })

  it('[K2c] the application guard fails after the clock went back, though the database guard would pass', async () => {
    // A first attempt cancelled at E-199 (it started at E-210 and would settle at E-160).
    databaseNow = at(E - 210)
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(E - 199)
    await orders.cancelPayment(ME, number, 1)
    // A failover to a member whose clock is behind.
    databaseNow = at(E - 205)
    memory.controls.counters.casAttempts = 0

    const refused = await failure(
      orders.startPayment(ME, number, 'pay-key-0000000000002', 'approve'),
    )
    expect(refused).toMatchObject({ code: 'payment_not_open', details: { reason: 'closing' } })
    expect(memory.controls.counters.casAttempts).toBe(0)
    expect(stored().payment!.attempts).toHaveLength(1)
  })

  it('[K2d] both guards fail', async () => {
    databaseNow = at(E - 199)
    memory.controls.counters.casAttempts = 0

    expect(
      await failure(orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')),
    ).toMatchObject({ details: { reason: 'closing' } })
    expect(memory.controls.counters.casAttempts).toBe(0)
  })
})

describe('the timings stored with the order, across a change of settings [K1-K8]', () => {
  // The order was placed by a service with the short timings; the service now runs with the demo's.
  let changed: ReturnType<typeof service>
  beforeEach(() => {
    changed = service(DEMO_PAYMENT_TIMINGS)
  })

  it('[K1] a new attempt uses the order settle delay and timeout', async () => {
    databaseNow = at(100)
    await changed.startPayment(ME, number, 'pay-key-0000000000001', 'approve')

    expect(stored().payment!.attempts[0]).toMatchObject({ settlesAt: at(150), timeoutAt: at(300) })
  })

  it('[K2] the start window is the order expiresAt minus the order timeout', async () => {
    databaseNow = at(E - 200)
    expect(
      (await changed.startPayment(ME, number, 'pay-key-0000000000001', 'approve')).created,
    ).toBe(true)

    const other = await orders.place(ME, input, 'order-key-00000000002')
    databaseNow = at(E - 199)
    expect(
      await failure(
        changed.startPayment(ME, other.order.orderNumber, 'pay-key-0000000000002', 'approve'),
      ),
    ).toMatchObject({ details: { reason: 'closing' } })
  })

  it('[K3] cancel uses the stored deadline', async () => {
    databaseNow = at(100)
    await changed.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(150)

    expect(await failure(changed.cancelPayment(ME, number, 1))).toMatchObject({
      code: 'payment_attempt_settled',
    })
  })

  it('[K4, K5] settling and timing out use the stored deadlines', async () => {
    databaseNow = at(100)
    await changed.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(150)
    expect((await changed.get(ME, number)).payment).toMatchObject({
      state: 'paid',
      paidAt: at(150).toISOString(),
    })

    const other = await orders.place(ME, input, 'order-key-00000000002')
    await changed.startPayment(ME, other.order.orderNumber, 'pay-key-0000000000002', 'no_answer')
    databaseNow = at(349)
    expect(statusOf(await changed.get(ME, other.order.orderNumber))).toBe('processing')
    databaseNow = at(350)
    expect(statusOf(await changed.get(ME, other.order.orderNumber))).toBe('timed_out')
  })

  it('[K6, K7] the order ends at its own expiresAt, and the window is shown from its own timeout', async () => {
    databaseNow = at(E - 1)
    const before = await changed.get(ME, number)
    expect(before.payment).toMatchObject({
      state: 'awaiting',
      attemptsOpenUntil: at(E - 200).toISOString(),
    })
    databaseNow = at(E)
    expect((await changed.get(ME, number)).payment!.state).toBe('expired')
  })

  it('[K8] an order placed with the long timings is not decided early by a service with short ones', async () => {
    const long = await changed.place(ME, input, 'order-key-00000000003')
    databaseNow = at(10)
    await orders.startPayment(ME, long.order.orderNumber, 'pay-key-0000000000004', 'approve')
    databaseNow = at(10 + 50)
    expect(statusOf(await orders.get(ME, long.order.orderNumber))).toBe('processing')
    databaseNow = at(10 + 3000)
    expect(statusOf(await orders.get(ME, long.order.orderNumber))).toBe('succeeded')
  })

  it("decides on the database's clock, whatever the process's clock says", async () => {
    appNow = new Date(START.getTime() + 60 * 60 * 1000)
    databaseNow = at(100)
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')

    expect(stored().payment!.attempts[0]!.createdAt).toEqual(at(100))
  })
})

describe('reading an order when the write of a due decision fails [G]', () => {
  beforeEach(async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(60)
    memory.controls.counters.casAttempts = 0
  })

  it('[G2] another request stored the decision first: one failed write, and the stored decision is shown', async () => {
    const other = service()
    memory.controls.beforeWrite = async () => {
      memory.controls.beforeWrite = undefined
      await other.get(ME, number)
    }

    const order = await orders.get(ME, number)
    expect(statusOf(order)).toBe('succeeded')
    expect(memory.controls.counters.casAttempts).toBe(2)
    expect(memory.controls.counters.localModifications).toBe(2) // the start and the other request
  })

  it('[G3] the guard does not hold by the database clock at the write: one attempt, processing is shown', async () => {
    memory.controls.beforeWrite = () => {
      databaseNow = at(40)
    }

    expect(statusOf(await orders.get(ME, number))).toBe('processing')
    expect(memory.controls.counters.casAttempts).toBe(1)
    expect(stored().payment!.attempts[0]!.status).toBe('processing')
  })

  it(`[G4] the version keeps changing: ${MAX_PAYMENT_WRITE_ATTEMPTS} attempts, no more, and the majority's view`, async () => {
    memory.controls.beforeWrite = () => {
      stored().payment!.version += 1
    }

    expect(statusOf(await orders.get(ME, number))).toBe('processing')
    expect(memory.controls.counters.casAttempts).toBe(MAX_PAYMENT_WRITE_ATTEMPTS)
  })

  it('[G5] the write is not confirmed: processing is shown, though the local copy has the decision', async () => {
    memory.controls.failWrites.push('write-concern')

    const order = await orders.get(ME, number)
    expect(statusOf(order)).toBe('processing')
    expect(stored().payment!.attempts[0]!.status).toBe('succeeded')
    expect(memory.controls.counters.casAttempts).toBe(1)

    memory.controls.commit()
    expect(statusOf(await orders.get(ME, number))).toBe('succeeded')
  })

  it('[G6a] another database error at the write: the majority view', async () => {
    memory.controls.failWrites.push('error')

    expect(statusOf(await orders.get(ME, number))).toBe('processing')
  })

  it('[G6b] the write and the majority read after it fail: 503, and no payment', async () => {
    memory.controls.beforeWrite = () => {
      memory.controls.failMajorityReads = 1
    }
    memory.controls.failWrites.push('error')

    expect(await failure(orders.get(ME, number))).toMatchObject({
      status: 503,
      code: 'database_unavailable',
    })
  })

  it('[G7] a majority behind the local copy: the older, true state is shown', async () => {
    databaseNow = at(60)
    await orders.get(ME, number)
    memory.controls.autoCommit = false
    await orders.refundPayment(ME, number)

    const order = await orders.get(ME, number)
    expect(order.payment!.state).toBe('paid')
    expect(stored().payment!.state).toBe('refunded')
  })

  it('[G8] an order the majority does not have yet: 503 order_not_confirmed', async () => {
    memory.controls.autoCommit = false
    const fresh = await orders.place(ME, input, 'order-key-00000000002')

    expect(await failure(orders.get(ME, fresh.order.orderNumber))).toMatchObject({
      status: 503,
      code: 'order_not_confirmed',
    })
  })

  it('[G9] whatever fails, an answer never shows a decided attempt the majority does not have', async () => {
    const failures = ['write-concern', 'error', undefined] as const
    for (let step = 0; step < 30; step += 1) {
      const injected = failures[step % failures.length]
      if (injected) memory.controls.failWrites.push(injected)
      if (step % 4 === 3) memory.controls.commit()
      if (step % 7 === 6) memory.controls.rollback()
      databaseNow = at(60 + step)

      let order: PublicOrder
      try {
        order = await orders.get(ME, number)
      } catch {
        continue
      }
      const majority = await majorityPayment()
      for (const [index, attempt] of order.payment!.attempts.entries()) {
        if (attempt.status !== 'processing') {
          expect(majority!.attempts[index]!.status).toBe(attempt.status)
        }
      }
      memory.controls.failWrites.length = 0
    }
  })
})

describe('many requests at once [C]', () => {
  beforeEach(async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(60)
    memory.controls.counters.localModifications = 0
    memory.controls.counters.majorityCommits = 0
    memory.controls.counters.casAttempts = 0
  })

  it('[C3, C8] 50 reads after the deadline store the decision once, and every one of them shows it', async () => {
    const answers = await Promise.all(Array.from({ length: 50 }, () => orders.get(ME, number)))

    expect(answers.every((order) => statusOf(order) === 'succeeded')).toBe(true)
    expect(memory.controls.counters.localModifications).toBe(1)
    expect(memory.controls.counters.majorityCommits).toBe(1)
    expect(memory.controls.counters.casAttempts).toBeLessThanOrEqual(
      50 * MAX_PAYMENT_WRITE_ATTEMPTS,
    )
    expect(stored().payment).toMatchObject({ state: 'paid', paidAt: at(50), version: 2 })
  })

  it('[C2] 50 reads whose writes always conflict try 3 times each, store nothing, and show processing', async () => {
    memory.controls.beforeWrite = () => {
      stored().payment!.version += 1
    }
    const answers = await Promise.all(Array.from({ length: 50 }, () => orders.get(ME, number)))

    expect(answers.every((order) => statusOf(order) === 'processing')).toBe(true)
    expect(memory.controls.counters.casAttempts).toBeLessThanOrEqual(
      50 * MAX_PAYMENT_WRITE_ATTEMPTS,
    )
    expect(memory.controls.counters.localModifications).toBe(0)
    expect(stored().payment!.attempts[0]!.status).toBe('processing')

    memory.controls.beforeWrite = undefined
    expect(statusOf(await orders.get(ME, number))).toBe('succeeded')
    expect(memory.controls.counters.localModifications).toBe(1)
  })

  it('[C4] 25 reads and 25 cancellations at once after the deadline: never cancelled', async () => {
    const [reads, cancels] = await Promise.all([
      Promise.all(Array.from({ length: 25 }, () => orders.get(ME, number))),
      Promise.all(Array.from({ length: 25 }, () => failure(orders.cancelPayment(ME, number, 1)))),
    ])

    expect(reads.every((order) => statusOf(order) === 'succeeded')).toBe(true)
    expect(cancels.every((error) => error.code === 'payment_attempt_settled')).toBe(true)
    expect(stored().payment!.attempts[0]!.status).toBe('succeeded')
  })

  it('[C5] after a decision was stored, a clock that goes back changes nothing', async () => {
    await orders.get(ME, number)
    const version = stored().payment!.version
    databaseNow = at(10)

    const cancels = await Promise.all(
      Array.from({ length: 10 }, () => failure(orders.cancelPayment(ME, number, 1))),
    )
    const reads = await Promise.all(Array.from({ length: 10 }, () => orders.get(ME, number)))
    expect(cancels.every((error) => error.status === 409)).toBe(true)
    expect(reads.every((order) => statusOf(order) === 'succeeded')).toBe(true)
    expect(stored().payment!.version).toBe(version)
  })

  it('[C6] an unconfirmed decision undone by a rollback is never shown, and is stored again once', async () => {
    memory.controls.failWrites.push('write-concern')
    expect(statusOf(await orders.get(ME, number))).toBe('processing')
    memory.controls.rollback()

    expect(statusOf(await orders.get(ME, number))).toBe('succeeded')
    expect(memory.controls.counters.localModifications).toBe(2)
    expect(memory.controls.counters.majorityCommits).toBe(1)
    expect(
      (await majorityPayment())!.attempts.filter((attempt) => attempt.status === 'succeeded'),
    ).toHaveLength(1)
    expect((await majorityPayment())!.version).toBe(2)
  })

  it('[C7] a committed decision survives a rollback, and no write of it matches again', async () => {
    await orders.get(ME, number)
    memory.controls.rollback()

    expect((await majorityPayment())!.state).toBe('paid')
    await orders.get(ME, number)
    expect(memory.controls.counters.majorityCommits).toBe(1)
  })
})

describe('ambiguous writes and lagging confirmation [P4]', () => {
  it('a replayed order that a majority does not have yet is 503, not success and not 404, until it is', async () => {
    memory.controls.autoCommit = false
    await orders.place(ME, input, 'order-key-00000000002')

    expect(await failure(orders.place(ME, input, 'order-key-00000000002'))).toMatchObject({
      status: 503,
      code: 'order_not_confirmed',
    })
    expect(await failure(orders.lookup(ME, 'order-key-00000000002'))).toMatchObject({
      code: 'order_not_confirmed',
    })
    memory.controls.commit()
    expect((await orders.place(ME, input, 'order-key-00000000002')).created).toBe(false)
    expect(
      memory.stored.filter((order) => order.idempotencyKey === 'order-key-00000000002'),
    ).toHaveLength(1)
  })

  it('the same order placed twice at once: the second waits for the first to be confirmed', async () => {
    memory.controls.autoCommit = false
    const results = await Promise.allSettled([
      orders.place(ME, input, 'order-key-00000000002'),
      orders.place(ME, input, 'order-key-00000000002'),
    ])

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'order_not_confirmed' })
    expect(
      memory.stored.filter((order) => order.idempotencyKey === 'order-key-00000000002'),
    ).toHaveLength(1)
  })

  it('an order write that was not confirmed is 503 write_not_confirmed; a rollback lets the retry make exactly one', async () => {
    memory.controls.failWrites.push('write-concern')
    expect(await failure(orders.place(ME, input, 'order-key-00000000002'))).toMatchObject({
      status: 503,
      code: 'write_not_confirmed',
    })
    expect(await failure(orders.place(ME, input, 'order-key-00000000002'))).toMatchObject({
      code: 'order_not_confirmed',
    })

    memory.controls.rollback()
    const retried = await orders.place(ME, input, 'order-key-00000000002')
    expect(retried.created).toBe(true)
    expect(
      memory.stored.filter((order) => order.idempotencyKey === 'order-key-00000000002'),
    ).toHaveLength(1)
  })

  it('a lookup of a key nobody used is 404', async () => {
    expect(await failure(orders.lookup(ME, 'order-key-00000000099'))).toMatchObject({
      status: 404,
      code: 'order_not_found',
    })
  })

  it('a payment command whose effect is not confirmed yet is 503, and the repeat gives it once it is', async () => {
    memory.controls.failWrites.push('write-concern')
    expect(
      await failure(orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')),
    ).toMatchObject({ code: 'write_not_confirmed' })
    // The repeat finds the attempt in the local copy, but the majority does not have it yet.
    expect(
      await failure(orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')),
    ).toMatchObject({ code: 'write_not_confirmed' })

    memory.controls.commit()
    const again = await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    expect(again.created).toBe(false)
    expect(stored().payment!.attempts).toHaveLength(1)
  })

  it('a refund whose answer was lost is the same refund when asked again, and never a second one', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    databaseNow = at(60)
    await orders.get(ME, number)
    databaseNow = at(70)
    memory.controls.failWrites.push('write-concern')
    expect(await failure(orders.refundPayment(ME, number))).toMatchObject({
      code: 'write_not_confirmed',
    })
    memory.controls.commit()

    databaseNow = at(90)
    const again = await orders.refundPayment(ME, number)
    expect(again.payment!.refundedAt).toBe(at(70).toISOString())
  })

  it(`a command whose write keeps conflicting tries ${MAX_PAYMENT_WRITE_ATTEMPTS} times, then answers 503 and stores nothing`, async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    memory.controls.counters.casAttempts = 0
    memory.controls.beforeWrite = () => {
      stored().payment!.version += 1
    }

    expect(await failure(orders.cancelPayment(ME, number, 1))).toMatchObject({
      status: 503,
      code: 'database_unavailable',
    })
    expect(memory.controls.counters.casAttempts).toBe(MAX_PAYMENT_WRITE_ATTEMPTS)
    expect(stored().payment!.attempts[0]!.status).toBe('processing')
  })

  it('a database failure before the write changes nothing, and the repeat does it once', async () => {
    memory.controls.failWrites.push('error')
    expect(
      await failure(orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')),
    ).toMatchObject({ status: 503, code: 'database_unavailable' })
    expect(stored().payment!.attempts).toHaveLength(0)

    expect(
      (await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')).created,
    ).toBe(true)
    expect(stored().payment!.attempts).toHaveLength(1)
  })
})

describe('listing orders', () => {
  it('writes nothing, and says when a decision is due', async () => {
    await orders.startPayment(ME, number, 'pay-key-0000000000001', 'approve')
    for (let index = 2; index <= 6; index += 1) {
      const other = await orders.place(ME, input, `order-key-0000000000${index}`)
      await orders.startPayment(
        ME,
        other.order.orderNumber,
        `pay-key-000000000000${index}`,
        'approve',
      )
    }
    databaseNow = at(500)
    memory.controls.counters.casAttempts = 0

    const page = await orders.list(ME)
    expect(memory.controls.counters.casAttempts).toBe(0)
    expect(page.items).toHaveLength(6)
    for (const order of page.items) {
      expect(order.payment).toMatchObject({ state: 'awaiting', pendingUpdate: true })
    }
  })

  it('reads the list from the majority', async () => {
    memory.controls.autoCommit = false
    await orders.place(ME, input, 'order-key-00000000002')

    expect((await orders.list(ME)).items.map((order: PublicOrder) => order.orderNumber)).toEqual([
      number,
    ])
  })
})

/** Keeps the type of the stored order in view for readers of these tests. */
export type StoredOrder = Order
