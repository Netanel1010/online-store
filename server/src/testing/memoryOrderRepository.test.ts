import { describe, expect, it } from 'vitest'
import { initialPayment, type StoredPayment } from '../orders/payment.ts'
import { WriteNotConfirmedError } from '../orders/repository.ts'
import type { Order } from '../orders/types.ts'
import { createMemoryOrderRepository } from './memoryOrderRepository.ts'

// The service and end-to-end tests trust this fake for what a single real MongoDB cannot show (a
// lagging majority, a rollback, a write that is not confirmed): it has to behave as described.
const START = new Date('2026-10-20T10:00:00.000Z')
const at = (ms: number) => new Date(START.getTime() + ms)

function setUp() {
  let now = START
  const memory = createMemoryOrderRepository({ now: () => now })
  const payment = initialPayment(START, {
    settleDelayMs: 50,
    attemptTimeoutMs: 200,
    expiryMs: 1000,
  })
  const order: Order = {
    orderNumber: 'DEMO-7K2M9QX4',
    userId: 'user-1',
    idempotencyKey: 'key-0000000000000001',
    requestHash: 'a'.repeat(64),
    createdAt: START,
    status: 'placed',
    lines: [{ productId: 'A-1', name: 'A', unitPrice: 800, quantity: 1 }],
    total: 800,
    originalTotal: 800,
    savings: 0,
    delivery: {
      fullName: 'נתנאל',
      email: 'n@example.com',
      phone: '0501234567',
      city: 'חיפה',
      street: 'הנשיא',
      houseNumber: '12',
      apartment: '',
      postalCode: '',
      notes: '',
    },
    payment,
  }
  return {
    ...memory,
    order,
    payment,
    setNow: (time: Date) => {
      now = time
    },
  }
}

const expectation = (payment: StoredPayment) => ({
  version: payment.version,
  state: payment.state,
  statuses: payment.attempts.map((attempt) => attempt.status),
})

describe('the in-memory order repository', () => {
  it("gives the database's clock with a read, and the same order from a plain and a majority read", async () => {
    const memory = setUp()
    await memory.repository.create(memory.order)
    memory.setNow(at(42))

    expect(await memory.repository.readWithClock('user-1', memory.order.orderNumber)).toEqual({
      order: memory.order,
      databaseNow: at(42),
    })
    expect(
      await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber, {
        majority: true,
      }),
    ).toEqual(memory.order)
  })

  it('writes a payment only against what it read, with the guards on its own clock at the moment of the write', async () => {
    const memory = setUp()
    await memory.repository.create(memory.order)
    const next = { ...memory.payment, version: 1 }

    // The order's time is up only at 1000.
    memory.setNow(at(999))
    expect(
      await memory.repository.updatePayment(
        'user-1',
        memory.order.orderNumber,
        expectation(memory.payment),
        [{ kind: 'expired' }],
        next,
      ),
    ).toBe(false)
    // A write that happens later than the request's read: the clock moves just before it is checked.
    memory.controls.beforeWrite = () => memory.setNow(at(1000))
    expect(
      await memory.repository.updatePayment(
        'user-1',
        memory.order.orderNumber,
        expectation(memory.payment),
        [{ kind: 'expired' }],
        next,
      ),
    ).toBe(true)
    expect(
      await memory.repository.updatePayment(
        'user-1',
        memory.order.orderNumber,
        expectation(memory.payment),
        [],
        next,
      ),
    ).toBe(false)
    // The order itself was one write, the payment the other.
    expect(memory.controls.counters).toEqual({
      casAttempts: 3,
      localModifications: 1,
      majorityCommits: 2,
    })
  })

  it('keeps an unconfirmed write in the local copy only, until it is committed or rolled back', async () => {
    const memory = setUp()
    await memory.repository.create(memory.order)
    memory.controls.failWrites.push('write-concern')

    await expect(
      memory.repository.updatePayment(
        'user-1',
        memory.order.orderNumber,
        expectation(memory.payment),
        [],
        {
          ...memory.payment,
          version: 1,
        },
      ),
    ).rejects.toBeInstanceOf(WriteNotConfirmedError)
    const plain = await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber)
    const majority = await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber, {
      majority: true,
    })
    expect(plain!.payment!.version).toBe(1)
    expect(majority!.payment!.version).toBe(0)

    memory.controls.rollback()
    expect(
      (await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber))!.payment!
        .version,
    ).toBe(0)
    expect(memory.controls.counters).toEqual({
      casAttempts: 1,
      localModifications: 1,
      majorityCommits: 1,
    })
  })

  it('without auto-commit, makes writes the majority only on commit, and counts each once', async () => {
    const memory = setUp()
    memory.controls.autoCommit = false
    await memory.repository.create(memory.order)
    expect(
      await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber, {
        majority: true,
      }),
    ).toBeNull()

    memory.controls.commit()
    expect(
      await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber, {
        majority: true,
      }),
    ).not.toBeNull()
    expect(memory.controls.counters.majorityCommits).toBe(1)
    // What was committed survives a rollback.
    memory.controls.rollback()
    expect(
      await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber),
    ).not.toBeNull()
  })

  it('fails the majority reads and the writes it is told to fail', async () => {
    const memory = setUp()
    await memory.repository.create(memory.order)
    memory.controls.failMajorityReads = 1
    memory.controls.failWrites.push('error')

    await expect(
      memory.repository.readWithClock('user-1', memory.order.orderNumber, { majority: true }),
    ).rejects.toThrow('The majority read failed')
    expect(
      await memory.repository.readWithClock('user-1', memory.order.orderNumber, { majority: true }),
    ).not.toBeNull()
    await expect(
      memory.repository.updatePayment(
        'user-1',
        memory.order.orderNumber,
        expectation(memory.payment),
        [],
        memory.payment,
      ),
    ).rejects.toThrow('The write failed')
    expect(
      (await memory.repository.findByOrderNumber('user-1', memory.order.orderNumber))!.payment!
        .version,
    ).toBe(0)
  })
})
