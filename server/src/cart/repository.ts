import { z } from 'zod'
import { MAX_QUANTITY } from '../../../src/features/cart/limits.ts'
import type { Database } from '../db/database.ts'
import type { CartItem, StoredCart } from './types.ts'

const COLLECTION = 'carts'
const PROJECTION = { _id: 0 } as const

/** The cart changed since it was read (or was created by someone else meanwhile): read it again. */
export class CartConflictError extends Error {
  constructor() {
    super('The cart was changed at the same time')
    this.name = 'CartConflictError'
  }
}

/**
 * Everything that knows about MongoDB for carts: the `carts` collection and its index. It takes and
 * returns validated carts and knows nothing about HTTP.
 *
 * An account has one cart, one document, and a unique index on the account is what keeps it so. A
 * change is a compare-and-swap on `revision`: it is written only if the cart is still the one that
 * was read. MongoDB does the comparing, in one atomic write, so two changes at the same moment
 * cannot both win; the loser gets a `CartConflictError` and the service reads and changes again.
 * That needs no transaction.
 */
export interface CartRepository {
  /** Creates the unique index on the account if it is missing. Safe to call any number of times. */
  ensureIndexes(): Promise<void>
  /** The account's cart, or null if it has none. */
  find(userId: string): Promise<StoredCart | null>
  /**
   * Writes the account's items. `expectedRevision` is the revision they were read at, or null when
   * the cart did not exist: a cart that has changed (or has appeared) since throws
   * `CartConflictError` and nothing is written.
   */
  save(
    userId: string,
    items: readonly CartItem[],
    expectedRevision: number | null,
    updatedAt: Date,
  ): Promise<void>
  /** Removes the account's cart. Nothing happens when there is none. */
  delete(userId: string): Promise<void>
}

const storedCartSchema = z.object({
  userId: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  ),
  revision: z.number().int().positive(),
  updatedAt: z.date(),
})

/** A stored document must still be a valid cart: a bad one is a data problem, not a client error. */
function toCart(document: unknown): StoredCart {
  const result = storedCartSchema.safeParse(document)
  if (!result.success) {
    throw new Error('A stored cart does not match the cart schema', { cause: result.error })
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

export function createCartRepository(database: Database): CartRepository {
  // Looked up when used, not when created: the database is connected before the first request.
  const carts = () => database.db().collection<StoredCart>(COLLECTION)

  return {
    async ensureIndexes() {
      await carts().createIndex({ userId: 1 }, { unique: true, name: 'userId_unique' })
    },

    async find(userId) {
      const document = await carts().findOne({ userId }, { projection: PROJECTION })
      return document === null ? null : toCart(document)
    },

    async save(userId, items, expectedRevision, updatedAt) {
      const stored = items.map(({ productId, quantity }) => ({ productId, quantity }))
      if (expectedRevision === null) {
        try {
          await carts().insertOne({ userId, items: stored, revision: 1, updatedAt })
        } catch (error) {
          if (isDuplicateOn(error, 'userId')) throw new CartConflictError()
          throw error
        }
        return
      }
      const { matchedCount } = await carts().updateOne(
        { userId, revision: expectedRevision },
        { $set: { items: stored, updatedAt }, $inc: { revision: 1 } },
      )
      if (matchedCount === 0) throw new CartConflictError()
    },

    async delete(userId) {
      await carts().deleteOne({ userId })
    },
  }
}
