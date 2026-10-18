import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDatabase, type Database } from '../db/database.ts'
import { initialPayment, type StoredAttempt, type StoredPayment } from './payment.ts'
import { createOrderRepository, type OrderRepository } from './repository.ts'
import { createOrderService, MAX_PAYMENT_WRITE_ATTEMPTS } from './service.ts'
import type { Order } from './types.ts'

// Optional: runs only when MONGODB_TEST_URI points at a real MongoDB, like orders.integration.test.ts,
// in a database of its own that it drops at the end. What it proves cannot be proven with a fake: that
// MongoDB evaluates the payment conditions on its own clock (`$$NOW`) against the stored fields, that a
// write that does not match changes nothing, and that a stored payment comes back exactly as it went in.
// It cannot show a failover, a rollback or a lagging majority: on a single server the majority is that
// server. Those are covered against the in-memory repository, which models them.
const uri = process.env.MONGODB_TEST_URI

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

describe.skipIf(!uri)(
  'demo payments on a real MongoDB (integration, needs MONGODB_TEST_URI)',
  () => {
    let database: Database
    let orders: OrderRepository

    /** The database's clock, as it is now. */
    async function databaseNow(): Promise<Date> {
      const [row] = await database
        .db()
        .aggregate<{ now: Date }>([{ $documents: [{ now: '$$NOW' }] }])
        .toArray()
      return row!.now
    }

    /** An order with a payment, stored, and the payment it was stored with. */
    async function orderWith(payment: StoredPayment): Promise<Order> {
      const order: Order = {
        orderNumber: `DEMO-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        userId: 'user-payments',
        idempotencyKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        createdAt: new Date(payment.expiresAt.getTime() - 1_800_000),
        status: 'placed',
        lines: [{ productId: 'A-1', name: 'A', unitPrice: 800, quantity: 1 }],
        total: 800,
        originalTotal: 800,
        savings: 0,
        delivery: DELIVERY,
        payment,
      }
      await orders.create(order)
      return order
    }

    /** A payment whose times are `offsets` milliseconds from the database's clock now. */
    async function paymentAround(offsets: { settles: number; timeout: number; expires: number }) {
      const now = (await databaseNow()).getTime()
      const attempt: StoredAttempt = {
        number: 1,
        idempotencyKey: randomUUID(),
        scenario: 'approve',
        createdAt: new Date(now - 1_000),
        settlesAt: new Date(now + offsets.settles),
        timeoutAt: new Date(now + offsets.timeout),
        status: 'processing',
        ignoredConfirmations: 0,
      }
      return {
        version: 3,
        state: 'awaiting' as const,
        expiresAt: new Date(now + offsets.expires),
        settleDelayMs: 3_000,
        attemptTimeoutMs: 120_000,
        attempts: [attempt],
      }
    }

    const expectation = (payment: StoredPayment) => ({
      version: payment.version,
      state: payment.state,
      statuses: payment.attempts.map((attempt) => attempt.status),
    })

    beforeAll(async () => {
      const dbName = `online_store_test_${randomUUID().slice(0, 8)}`
      database = createDatabase({ uri: uri!, dbName, connectTimeoutMs: 10_000 })
      await database.connect()
      orders = createOrderRepository(database)
      await orders.ensureIndexes()
    })

    afterAll(async () => {
      await database.db().dropDatabase()
      await database.close()
    })

    describe('the repository', () => {
      it('stores a payment and reads it back exactly, to the millisecond, from a plain and a majority read', async () => {
        const payment = initialPayment(new Date('2026-10-20T10:00:00.123Z'), {
          settleDelayMs: 3000,
          attemptTimeoutMs: 20000,
          expiryMs: 1_800_000,
        })
        const order = await orderWith(payment)

        const local = await orders.findByOrderNumber(order.userId, order.orderNumber)
        const majority = await orders.findByOrderNumber(order.userId, order.orderNumber, {
          majority: true,
        })
        expect(local).toEqual(order)
        expect(majority).toEqual(order)
        expect(local!.payment!.expiresAt.getTime()).toBe(payment.expiresAt.getTime())
      })

      it("reads an order with the database's clock as a date, from a plain and a majority read", async () => {
        const order = await orderWith(
          await paymentAround({ settles: 5_000, timeout: 20_000, expires: 60_000 }),
        )
        const before = await databaseNow()

        const read = await orders.readWithClock(order.userId, order.orderNumber, { majority: true })
        expect(read!.order).toEqual(order)
        expect(read!.databaseNow).toBeInstanceOf(Date)
        expect(read!.databaseNow.getTime()).toBeGreaterThanOrEqual(before.getTime())
        const { databaseNow: listed } = await orders.listForUser(order.userId, {
          skip: 0,
          limit: 1,
        })
        expect(listed).toBeInstanceOf(Date)
      })

      it('writes the payment only against the version and statuses it read, and changes nothing otherwise', async () => {
        const payment = await paymentAround({ settles: 60_000, timeout: 120_000, expires: 600_000 })
        const order = await orderWith(payment)
        const next = { ...payment, version: 4 }

        expect(
          await orders.updatePayment(
            order.userId,
            order.orderNumber,
            { ...expectation(payment), version: 2 },
            [],
            next,
          ),
        ).toBe(false)
        expect(
          await orders.updatePayment(
            order.userId,
            order.orderNumber,
            { ...expectation(payment), statuses: ['failed'] },
            [],
            next,
          ),
        ).toBe(false)
        expect(
          await orders.updatePayment(
            'someone-else',
            order.orderNumber,
            expectation(payment),
            [],
            next,
          ),
        ).toBe(false)
        expect(
          (await orders.findByOrderNumber(order.userId, order.orderNumber))!.payment!.version,
        ).toBe(3)

        expect(
          await orders.updatePayment(
            order.userId,
            order.orderNumber,
            expectation(payment),
            [],
            next,
          ),
        ).toBe(true)
        // The same write again is against a version that is gone.
        expect(
          await orders.updatePayment(
            order.userId,
            order.orderNumber,
            expectation(payment),
            [],
            next,
          ),
        ).toBe(false)
        const stored = await orders.findByOrderNumber(order.userId, order.orderNumber, {
          majority: true,
        })
        expect(stored!.payment!.version).toBe(4)
        expect(stored!.lines).toEqual(order.lines)
      })

      it.each([
        // K9: each condition against the stored field, two seconds either side of the database's clock.
        [
          'atOrAfter a deadline that passed',
          { settles: -2_000 },
          { kind: 'atOrAfter', attempt: 0, field: 'settlesAt' },
          true,
        ],
        [
          'atOrAfter a deadline to come',
          { settles: 2_000 },
          { kind: 'atOrAfter', attempt: 0, field: 'settlesAt' },
          false,
        ],
        [
          'before a deadline to come',
          { settles: 2_000 },
          { kind: 'before', attempt: 0, field: 'settlesAt' },
          true,
        ],
        [
          'before a deadline that passed',
          { settles: -2_000 },
          { kind: 'before', attempt: 0, field: 'settlesAt' },
          false,
        ],
        [
          'before a timeout to come',
          { timeout: 2_000 },
          { kind: 'before', attempt: 0, field: 'timeoutAt' },
          true,
        ],
        [
          'atOrAfter a timeout that passed',
          { timeout: -2_000 },
          { kind: 'atOrAfter', attempt: 0, field: 'timeoutAt' },
          true,
        ],
        ['expired, after expiresAt', { expires: -2_000 }, { kind: 'expired' }, true],
        ['expired, before expiresAt', { expires: 2_000 }, { kind: 'expired' }, false],
        // startWindow: now + the stored timeout must be at or before expiresAt.
        [
          'startWindow with time to spare',
          { timeout: 10_000, expires: 30_000 },
          { kind: 'startWindow' },
          true,
        ],
        [
          'startWindow too late',
          { timeout: 10_000, expires: 9_000 },
          { kind: 'startWindow' },
          false,
        ],
      ] as const)('evaluates %s on the database clock', async (_what, offsets, guard, holds) => {
        const payment = await paymentAround({
          settles: 60_000,
          timeout: 120_000,
          expires: 600_000,
          ...offsets,
        })
        // The guards read the stored fields; the timeout the start guard adds is the stored one.
        const order = await orderWith({
          ...payment,
          attemptTimeoutMs: 'timeout' in offsets ? offsets.timeout : 120_000,
        })

        expect(
          await orders.updatePayment(
            order.userId,
            order.orderNumber,
            expectation(payment),
            [guard],
            {
              ...payment,
              version: 4,
            },
          ),
        ).toBe(holds)
      })

      it('stores times as dates, never the text of an expression', async () => {
        const payment = await paymentAround({ settles: 60_000, timeout: 120_000, expires: 600_000 })
        const order = await orderWith(payment)
        const now = await databaseNow()
        const next: StoredPayment = {
          ...payment,
          version: 4,
          attempts: [
            {
              ...payment.attempts[0]!,
              status: 'cancelled',
              cancelledBy: 'visitor',
              settledAt: now,
            },
          ],
        }
        await orders.updatePayment(order.userId, order.orderNumber, expectation(payment), [], next)

        const raw = await database
          .db()
          .collection('orders')
          .findOne({ orderNumber: order.orderNumber })
        const attempt = (raw!.payment as { attempts: Record<string, unknown>[] }).attempts[0]!
        for (const field of ['createdAt', 'settlesAt', 'timeoutAt', 'settledAt']) {
          expect(attempt[field], field).toBeInstanceOf(Date)
        }
        expect(JSON.stringify(raw)).not.toContain('$$NOW')
      })
    })

    describe('the service', () => {
      /** The repository, counting the payment writes that matched, and able to delay them. */
      function instrumented(delayMs = 0) {
        const counts = { attempts: 0, matched: 0 }
        const repository: OrderRepository = {
          ...orders,
          async updatePayment(...args) {
            counts.attempts += 1
            if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
            const written = await orders.updatePayment(...args)
            if (written) counts.matched += 1
            return written
          },
        }
        return { repository, counts }
      }
      const serviceOver = (repository: OrderRepository, now?: () => Date) =>
        createOrderService({
          orders: repository,
          products: { findByIds: () => Promise.resolve([]) },
          ...(now && { now }),
        })

      it('[C1] 50 reads at once after the deadline: one write matches, the version moves by one, all show the decision', async () => {
        const payment = await paymentAround({ settles: -1_000, timeout: 20_000, expires: 600_000 })
        const order = await orderWith(payment)
        const { repository, counts } = instrumented()
        const service = serviceOver(repository)

        const answers = await Promise.all(
          Array.from({ length: 50 }, () => service.get(order.userId, order.orderNumber)),
        )

        // This counts compare-and-set matches. On a single server, the majority is that server: it
        // shows atomicity and that one write wins, not durability across a failover.
        expect(counts.matched).toBe(1)
        expect(counts.attempts).toBeLessThanOrEqual(50 * MAX_PAYMENT_WRITE_ATTEMPTS)
        const stored = await orders.findByOrderNumber(order.userId, order.orderNumber, {
          majority: true,
        })
        expect(stored!.payment).toMatchObject({ state: 'paid', version: payment.version + 1 })
        expect(stored!.payment!.paidAt).toEqual(payment.attempts[0]!.settlesAt)
        expect(answers.every((answer) => answer.payment!.attempts[0]!.status === 'succeeded')).toBe(
          true,
        )
      })

      it('[K2e] a start whose write is delayed past the window: no attempt, and closing', async () => {
        const now = (await databaseNow()).getTime()
        // The window closes 300 ms from now; the write happens 600 ms later than its read.
        const payment: StoredPayment = {
          version: 0,
          state: 'awaiting',
          expiresAt: new Date(now + 20_000 + 300),
          settleDelayMs: 3_000,
          attemptTimeoutMs: 20_000,
          attempts: [],
        }
        const order = await orderWith(payment)
        const { repository, counts } = instrumented(600)

        const refused = serviceOver(repository).startPayment(
          order.userId,
          order.orderNumber,
          randomUUID(),
          'approve',
        )
        await expect(refused).rejects.toMatchObject({
          status: 409,
          code: 'payment_not_open',
          details: { reason: 'closing' },
        })
        expect(counts.matched).toBe(0)
        const stored = await orders.findByOrderNumber(order.userId, order.orderNumber)
        expect(stored!.payment).toMatchObject({ version: 0, attempts: [] })
      })

      it('a cancellation read before the deadline and written after it is refused, and the decision stands', async () => {
        const payment = await paymentAround({ settles: 300, timeout: 20_000, expires: 600_000 })
        const order = await orderWith(payment)
        const { repository, counts } = instrumented(600)

        await expect(
          serviceOver(repository).cancelPayment(order.userId, order.orderNumber, 1),
        ).rejects.toMatchObject({ status: 409, code: 'payment_attempt_settled' })
        expect(counts.matched).toBe(0)
        const read = await serviceOver(orders).get(order.userId, order.orderNumber)
        expect(read.payment!.attempts[0]!.status).toBe('succeeded')
      })

      it("decides on the database's clock: a process clock an hour off changes nothing", async () => {
        const payment = await paymentAround({ settles: -1_000, timeout: 20_000, expires: 600_000 })
        const ahead = await orderWith(payment)
        const behind = await orderWith(payment)

        const hour = 60 * 60 * 1000
        const early = await serviceOver(orders, () => new Date(Date.now() - hour)).get(
          behind.userId,
          behind.orderNumber,
        )
        const late = await serviceOver(orders, () => new Date(Date.now() + hour)).get(
          ahead.userId,
          ahead.orderNumber,
        )
        expect(early.payment!.attempts[0]!.status).toBe('succeeded')
        expect(late.payment!.attempts[0]!.status).toBe('succeeded')
        expect(early.payment!.paidAt).toBe(late.payment!.paidAt)
      })
    })
  },
)
