import { z } from 'zod'
import type { Database } from '../db/database.ts'
import type { Order } from './types.ts'

const COLLECTION = 'orders'
const PROJECTION = { _id: 0 } as const

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
 * Everything that knows about MongoDB for orders: the `orders` collection and its indexes. It takes
 * and returns validated `Order`s and knows nothing about HTTP. An order is written once and never
 * changed or deleted, so there is no update and no delete here.
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
   * the order number, or the account's idempotency key, is already used.
   */
  create(order: Order): Promise<void>
  /** The order of this account with this number, or null. Another account's order is never found. */
  findByOrderNumber(userId: string, orderNumber: string): Promise<Order | null>
  /** The order this account made with this idempotency key, or null. */
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Order | null>
  /** One page of the account's orders, the newest first, and how many orders it has in all. */
  listForUser(
    userId: string,
    range: { skip: number; limit: number },
  ): Promise<{ items: Order[]; total: number }>
}

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

/** MongoDB's answer to a write that breaks a unique index, and which index it was. */
function isDuplicateOn(error: unknown, field: string): boolean {
  const { code, keyPattern } = (error ?? {}) as {
    code?: unknown
    keyPattern?: Record<string, unknown>
  }
  return code === 11000 && keyPattern !== undefined && field in keyPattern
}

export function createOrderRepository(database: Database): OrderRepository {
  // Looked up when used, not when created: the database is connected before the first request.
  const orders = () => database.db().collection<Order>(COLLECTION)

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
        if (isDuplicateOn(error, 'idempotencyKey')) throw new DuplicateIdempotencyKeyError()
        if (isDuplicateOn(error, 'orderNumber')) throw new DuplicateOrderNumberError()
        throw error
      }
    },

    async findByOrderNumber(userId, orderNumber) {
      // The account is part of the query: an order of someone else is not found, not hidden after.
      const document = await orders().findOne({ userId, orderNumber }, { projection: PROJECTION })
      return document === null ? null : toOrder(document)
    },

    async findByIdempotencyKey(userId, idempotencyKey) {
      const document = await orders().findOne(
        { userId, idempotencyKey },
        { projection: PROJECTION },
      )
      return document === null ? null : toOrder(document)
    },

    async listForUser(userId, { skip, limit }) {
      const collection = orders()
      const [documents, total] = await Promise.all([
        collection
          .find({ userId }, { projection: PROJECTION })
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments({ userId }),
      ])
      return { items: documents.map(toOrder), total }
    },
  }
}
