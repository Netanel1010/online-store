import { MongoWriteConcernError, type Document } from 'mongodb'
import { z } from 'zod'
import {
  ATTEMPT_STATUSES,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_SCENARIOS,
  PAYMENT_STATES,
} from '../../../src/features/orders/payment.ts'
import type { Database } from '../db/database.ts'
import type { PaymentExpectation, PaymentGuard, StoredPayment } from './payment.ts'
import type { Order } from './types.ts'

const COLLECTION = 'orders'
const PROJECTION = { _id: 0 } as const
/** The field a read adds for the database's clock, taken off again before the order is checked. */
const CLOCK = '__databaseNow'

/**
 * Every write of an order waits until a majority of the database's members has it, so a write that was
 * acknowledged survives a failover, and gives up waiting after 10 seconds: then the write may or may
 * not have been applied, and the caller is told so (`WriteNotConfirmedError`), never that it worked.
 * On a single server (tests, CI) the majority is that server: the setting is accepted and adds nothing.
 */
const WRITE_CONCERN = { w: 'majority', wtimeoutMS: 10_000 } as const

/** Another order already has this order number (a coincidence: the service draws a new one). */
export class DuplicateOrderNumberError extends Error {
  constructor() {
    super('An order with this order number already exists')
    this.name = 'DuplicateOrderNumberError'
  }
}

/** This account already placed an order with this idempotency key: the request was sent twice. */
export class DuplicateIdempotencyKeyError extends Error {
  constructor() {
    super('This account already has an order with this idempotency key')
    this.name = 'DuplicateIdempotencyKeyError'
  }
}

/**
 * A write was not confirmed by a majority in time. It may have been applied, and may still be undone
 * by a failover: nothing may be reported from it, and asking again with the same key is safe.
 */
export class WriteNotConfirmedError extends Error {
  constructor(options?: ErrorOptions) {
    super('The write was not confirmed by a majority of the database', options)
    this.name = 'WriteNotConfirmedError'
  }
}

/**
 * How a read is made. A plain read is of the primary as it is now, which is what tells whether an
 * order exists and what a write is compared with. A `majority` read sees only what a majority has, and
 * so only what a failover cannot undo: it is what an answer may show of a payment, and what confirms
 * that an order found by a plain read will stay.
 */
export interface ReadOptions {
  majority?: boolean
}

/**
 * Everything that knows about MongoDB for orders: the `orders` collection and its indexes. It takes
 * and returns validated `Order`s and knows nothing about HTTP. What was ordered is written once and
 * never changed; the only change is to an order's `payment`, by `updatePayment`, and nothing is deleted.
 *
 * Three indexes keep orders correct and fast:
 *  - the order number is unique, because it is how an order is found and quoted;
 *  - the account and the idempotency key are unique together, so the same request sent twice, even
 *    at the same moment, can only ever make one order (the database decides, not the code);
 *  - the account, the time and the id, newest first, serve the list of an account's orders and its
 *    paging (the id breaks a tie between two orders made in the same millisecond).
 */
export interface OrderRepository {
  /** Creates the indexes if they are missing. Safe to call any number of times. */
  ensureIndexes(): Promise<void>
  /**
   * Stores a new order. Throws `DuplicateOrderNumberError` or `DuplicateIdempotencyKeyError` when
   * the order number, or the account's idempotency key, is already used, and
   * `WriteNotConfirmedError` when a majority did not confirm it in time.
   */
  create(order: Order): Promise<void>
  /** The order of this account with this number, or null. Another account's order is never found. */
  findByOrderNumber(
    userId: string,
    orderNumber: string,
    options?: ReadOptions,
  ): Promise<Order | null>
  /** The order this account made with this idempotency key, or null (a plain read). */
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Order | null>
  /** The order with the database's clock (`$$NOW`) at the moment it was read, or null. */
  readWithClock(
    userId: string,
    orderNumber: string,
    options?: ReadOptions,
  ): Promise<{ order: Order; databaseNow: Date } | null>
  /**
   * One page of the account's orders, the newest first, how many orders it has in all, and the
   * database's clock (null when the page is empty).
   */
  listForUser(
    userId: string,
    range: { skip: number; limit: number },
    options?: ReadOptions,
  ): Promise<{ items: Order[]; total: number; databaseNow: Date | null }>
  /**
   * Replaces the payment of an order with `next`, only if the stored payment is still the one
   * `expected` describes (its version, state and the status of each attempt) and every guard holds by
   * the database's clock at the moment of the write. True when it was written, false when it was not
   * (nothing at all is changed then). Throws `WriteNotConfirmedError` when a majority did not confirm
   * the write in time.
   */
  updatePayment(
    userId: string,
    orderNumber: string,
    expected: PaymentExpectation,
    guards: readonly PaymentGuard[],
    next: StoredPayment,
  ): Promise<boolean>
}

const storedAttemptSchema = z.object({
  number: z.number().int().min(1).max(MAX_PAYMENT_ATTEMPTS),
  idempotencyKey: z.string().min(1),
  scenario: z.enum(PAYMENT_SCENARIOS),
  createdAt: z.date(),
  settlesAt: z.date(),
  timeoutAt: z.date(),
  status: z.enum(ATTEMPT_STATUSES),
  settledAt: z.date().optional(),
  cancelledBy: z.enum(['visitor', 'provider']).optional(),
  ignoredConfirmations: z.number().int().min(0),
})

const storedPaymentSchema = z
  .object({
    version: z.number().int().min(0),
    state: z.enum(PAYMENT_STATES),
    expiresAt: z.date(),
    settleDelayMs: z.number().int().positive(),
    attemptTimeoutMs: z.number().int().positive(),
    attempts: z.array(storedAttemptSchema).max(MAX_PAYMENT_ATTEMPTS),
    paidAt: z.date().optional(),
    refundedAt: z.date().optional(),
  })
  .refine((payment) => payment.settleDelayMs < payment.attemptTimeoutMs)

const storedOrderSchema = z.object({
  orderNumber: z.string().min(1),
  userId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  requestHash: z.string().min(1),
  createdAt: z.date(),
  status: z.literal('placed'),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        name: z.string().min(1),
        unitPrice: z.number().int().positive(),
        originalUnitPrice: z.number().int().positive().optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
  total: z.number().int().nonnegative(),
  originalTotal: z.number().int().nonnegative(),
  savings: z.number().int().nonnegative(),
  // Read back as it was stored: the rules of the form may change, an old order must still open.
  delivery: z.object({
    fullName: z.string(),
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    street: z.string(),
    houseNumber: z.string(),
    apartment: z.string(),
    postalCode: z.string(),
    notes: z.string(),
  }),
  // Without it the read would drop a stored payment, and a write made from that read would erase it.
  payment: storedPaymentSchema.optional(),
})

/** A stored document must still be a valid order: a bad one is a data problem, not a client error. */
function toOrder(document: unknown): Order {
  const result = storedOrderSchema.safeParse(document)
  if (!result.success) {
    // Never the document: it holds an address and a phone number.
    throw new Error('A stored order does not match the order schema', { cause: result.error })
  }
  return result.data
}

/** An order read together with the database's clock. */
function withClock(document: Document): { order: Order; databaseNow: Date } {
  const { [CLOCK]: databaseNow, ...rest } = document
  if (!(databaseNow instanceof Date)) throw new Error('The database did not give its clock')
  return { order: toOrder(rest), databaseNow }
}

/** MongoDB's answer to a write that breaks a unique index, and which index it was. */
function isDuplicateOn(error: unknown, field: string): boolean {
  const { code, keyPattern } = (error ?? {}) as {
    code?: unknown
    keyPattern?: Record<string, unknown>
  }
  return code === 11000 && keyPattern !== undefined && field in keyPattern
}

/** A guard as a condition on the database's clock and the document's own stored fields. */
function guardExpression(guard: PaymentGuard): Document {
  switch (guard.kind) {
    case 'atOrAfter':
      return {
        $gte: ['$$NOW', { $arrayElemAt: [`$payment.attempts.${guard.field}`, guard.attempt] }],
      }
    case 'before':
      return {
        $lt: ['$$NOW', { $arrayElemAt: [`$payment.attempts.${guard.field}`, guard.attempt] }],
      }
    case 'expired':
      return { $gte: ['$$NOW', '$payment.expiresAt'] }
    case 'startWindow':
      return { $lte: [{ $add: ['$$NOW', '$payment.attemptTimeoutMs'] }, '$payment.expiresAt'] }
  }
}

/** The filter of a payment write: the order, the payment exactly as it was read, and the guards. */
export function paymentFilter(
  userId: string,
  orderNumber: string,
  expected: PaymentExpectation,
  guards: readonly PaymentGuard[],
): Document {
  return {
    userId,
    orderNumber,
    'payment.version': expected.version,
    $expr: {
      $and: [
        { $eq: ['$payment.state', expected.state] },
        { $eq: ['$payment.attempts.status', expected.statuses] },
        ...guards.map(guardExpression),
      ],
    },
  }
}

export function createOrderRepository(database: Database): OrderRepository {
  // Looked up when used, not when created: the database is connected before the first request.
  const orders = () => database.db().collection<Order>(COLLECTION, { writeConcern: WRITE_CONCERN })
  const fromMajority = () =>
    database
      .db()
      .collection<Order>(COLLECTION, {
        writeConcern: WRITE_CONCERN,
        readConcern: { level: 'majority' },
      })
  const collection = (options?: ReadOptions) => (options?.majority ? fromMajority() : orders())

  return {
    async ensureIndexes() {
      await Promise.all([
        orders().createIndex({ orderNumber: 1 }, { unique: true, name: 'orderNumber_unique' }),
        orders().createIndex(
          { userId: 1, idempotencyKey: 1 },
          { unique: true, name: 'userId_idempotencyKey_unique' },
        ),
        orders().createIndex(
          { userId: 1, createdAt: -1, _id: -1 },
          { name: 'userId_createdAt_id' },
        ),
      ])
    },

    async create(order) {
      try {
        await orders().insertOne({ ...order })
      } catch (error) {
        if (error instanceof MongoWriteConcernError)
          throw new WriteNotConfirmedError({ cause: error })
        if (isDuplicateOn(error, 'idempotencyKey')) throw new DuplicateIdempotencyKeyError()
        if (isDuplicateOn(error, 'orderNumber')) throw new DuplicateOrderNumberError()
        throw error
      }
    },

    async findByOrderNumber(userId, orderNumber, options) {
      // The account is part of the query: an order of someone else is not found, not hidden after.
      const document = await collection(options).findOne(
        { userId, orderNumber },
        { projection: PROJECTION },
      )
      return document === null ? null : toOrder(document)
    },

    async findByIdempotencyKey(userId, idempotencyKey) {
      const document = await orders().findOne(
        { userId, idempotencyKey },
        { projection: PROJECTION },
      )
      return document === null ? null : toOrder(document)
    },

    async readWithClock(userId, orderNumber, options) {
      const [document] = await collection(options)
        .aggregate([
          { $match: { userId, orderNumber } },
          { $limit: 1 },
          { $project: PROJECTION },
          { $set: { [CLOCK]: '$$NOW' } },
        ])
        .toArray()
      return document === undefined ? null : withClock(document)
    },

    async listForUser(userId, { skip, limit }, options) {
      const source = collection(options)
      const [documents, total] = await Promise.all([
        source
          .aggregate([
            { $match: { userId } },
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: skip },
            { $limit: limit },
            { $project: PROJECTION },
            { $set: { [CLOCK]: '$$NOW' } },
          ])
          .toArray(),
        source.countDocuments({ userId }),
      ])
      const read = documents.map(withClock)
      return {
        items: read.map(({ order }) => order),
        total,
        databaseNow: read[0]?.databaseNow ?? null,
      }
    },

    async updatePayment(userId, orderNumber, expected, guards, next) {
      try {
        const { matchedCount } = await orders().updateOne(
          paymentFilter(userId, orderNumber, expected, guards),
          { $set: { payment: next } },
        )
        return matchedCount === 1
      } catch (error) {
        if (error instanceof MongoWriteConcernError)
          throw new WriteNotConfirmedError({ cause: error })
        throw error
      }
    },
  }
}
