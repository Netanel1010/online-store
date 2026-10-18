import { guardHolds } from '../orders/payment.ts'
import {
  DuplicateIdempotencyKeyError,
  DuplicateOrderNumberError,
  WriteNotConfirmedError,
  type OrderRepository,
} from '../orders/repository.ts'
import type { Order } from '../orders/types.ts'

/** A failure to give the next write: it is applied but not confirmed, or it is not applied at all. */
export type InjectedWriteFailure = 'write-concern' | 'error'

/**
 * What a test can do to the in-memory database, to reach the cases a single real server cannot show:
 *  - `clock`: the database's clock (`$$NOW`), which a test may move, also backwards (a failover to a
 *    member with a slower clock);
 *  - `autoCommit`: when false, writes reach the local copy only, until `commit()` makes them the
 *    majority's or `rollback()` undoes them (a failover before they were replicated);
 *  - `failWrites`: failures given to the next writes, in order;
 *  - `failMajorityReads`: how many of the next majority reads fail;
 *  - `beforeWrite`: run just before a write is checked, for a write that happens later than its read;
 *  - `counters`: compare-and-set attempts, the ones that matched and changed the local copy, and the
 *    writes that a majority has (a write is counted there once, when it is committed).
 */
export interface MemoryOrderControls {
  clock: () => Date
  autoCommit: boolean
  failWrites: InjectedWriteFailure[]
  failMajorityReads: number
  beforeWrite?: () => void | Promise<void>
  counters: { casAttempts: number; localModifications: number; majorityCommits: number }
  commit(): void
  rollback(): void
}

const clone = <T>(value: T): T => structuredClone(value)

/**
 * An `OrderRepository` that keeps the orders in memory, with the behaviour the real one has: the
 * order number is unique, so is the pair of account and idempotency key, an order is only ever found
 * by the account it belongs to, a list is the newest first (a later insertion is the newer one when two
 * orders have the same time, like the id breaks a tie in the real repository), and a payment write
 * succeeds only against the payment it expects and when its guards hold by the database's clock. It
 * keeps a local copy and a majority copy, which are the same unless a test says otherwise. It lets the
 * service, the routes and the end-to-end tests run without MongoDB. The real repository is checked
 * against MongoDB by the optional integration test.
 */
export function createMemoryOrderRepository(options: { now?: () => Date } = {}) {
  /** The primary's copy, as a plain read sees it. */
  const stored: Order[] = []
  /** What a majority has, as a majority read sees it. */
  let majority: Order[] = []
  let pending = 0

  const controls: MemoryOrderControls = {
    clock: options.now ?? (() => new Date()),
    autoCommit: true,
    failWrites: [],
    failMajorityReads: 0,
    counters: { casAttempts: 0, localModifications: 0, majorityCommits: 0 },
    commit() {
      majority = clone(stored)
      controls.counters.majorityCommits += pending
      pending = 0
    },
    rollback() {
      stored.splice(0, stored.length, ...clone(majority))
      pending = 0
    },
  }

  /** After a write reached the local copy: confirmed, or left unconfirmed (and then reported so). */
  function settle(failure: InjectedWriteFailure | undefined) {
    pending += 1
    if (failure === 'write-concern') throw new WriteNotConfirmedError()
    if (controls.autoCommit) controls.commit()
  }

  function source(majorityRead: boolean | undefined): Order[] {
    if (!majorityRead) return stored
    if (controls.failMajorityReads > 0) {
      controls.failMajorityReads -= 1
      throw new Error('The majority read failed')
    }
    return majority
  }

  const own = (orders: Order[], userId: string, orderNumber: string) =>
    orders.find((order) => order.userId === userId && order.orderNumber === orderNumber)

  const repository: OrderRepository = {
    ensureIndexes: () => Promise.resolve(),

    async create(order) {
      const failure = controls.failWrites.shift()
      if (failure === 'error') throw new Error('The write failed')
      // The key is checked first, like MongoDB reports the first index that is broken in the order
      // they were made; the service handles both the same way.
      if (
        stored.some(
          (existing) =>
            existing.userId === order.userId && existing.idempotencyKey === order.idempotencyKey,
        )
      ) {
        throw new DuplicateIdempotencyKeyError()
      }
      if (stored.some((existing) => existing.orderNumber === order.orderNumber)) {
        throw new DuplicateOrderNumberError()
      }
      stored.push(clone(order))
      settle(failure)
    },

    async findByOrderNumber(userId, orderNumber, readOptions) {
      const found = own(source(readOptions?.majority), userId, orderNumber)
      return found ? clone(found) : null
    },

    findByIdempotencyKey(userId, idempotencyKey) {
      const found = stored.find(
        (order) => order.userId === userId && order.idempotencyKey === idempotencyKey,
      )
      return Promise.resolve(found ? clone(found) : null)
    },

    async readWithClock(userId, orderNumber, readOptions) {
      const found = own(source(readOptions?.majority), userId, orderNumber)
      return found ? { order: clone(found), databaseNow: controls.clock() } : null
    },

    async listForUser(userId, { skip, limit }, readOptions) {
      const all = source(readOptions?.majority)
      const mine = all
        .map((order, position) => ({ order, position }))
        .filter(({ order }) => order.userId === userId)
        .sort(
          (a, b) =>
            b.order.createdAt.getTime() - a.order.createdAt.getTime() || b.position - a.position,
        )
      const items = mine.slice(skip, skip + limit).map(({ order }) => clone(order))
      return {
        items,
        total: mine.length,
        databaseNow: items.length > 0 ? controls.clock() : null,
      }
    },

    async updatePayment(userId, orderNumber, expected, guards, next) {
      controls.counters.casAttempts += 1
      await controls.beforeWrite?.()
      const failure = controls.failWrites.shift()
      if (failure === 'error') throw new Error('The write failed')

      const order = own(stored, userId, orderNumber)
      const payment = order?.payment
      const now = controls.clock()
      const matches =
        payment !== undefined &&
        payment.version === expected.version &&
        payment.state === expected.state &&
        payment.attempts.length === expected.statuses.length &&
        payment.attempts.every((attempt, index) => attempt.status === expected.statuses[index]) &&
        guards.every((guard) => guardHolds(guard, payment, now))
      if (!matches) return false

      order!.payment = clone(next)
      controls.counters.localModifications += 1
      settle(failure)
      return true
    },
  }

  return { repository, stored, controls }
}
