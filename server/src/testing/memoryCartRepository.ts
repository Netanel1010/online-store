import { CartConflictError, type CartRepository } from '../cart/repository.ts'
import type { StoredCart } from '../cart/types.ts'

/**
 * A `CartRepository` that keeps the carts in memory, with the behaviour the real one has: one cart
 * per account, and a write that only succeeds if the cart is still at the revision it was read at.
 * It lets the service, the routes and the end-to-end tests run without MongoDB. The real repository
 * is checked against MongoDB by the optional integration test.
 */
export function createMemoryCartRepository() {
  const stored = new Map<string, StoredCart>()

  const repository: CartRepository = {
    ensureIndexes: () => Promise.resolve(),

    find(userId) {
      const found = stored.get(userId)
      return Promise.resolve(found ? structuredClone(found) : null)
    },

    save(userId, items, expectedRevision, updatedAt) {
      const current = stored.get(userId)
      if (expectedRevision === null) {
        if (current) return Promise.reject(new CartConflictError())
        stored.set(userId, { userId, items: structuredClone([...items]), revision: 1, updatedAt })
        return Promise.resolve()
      }
      if (!current || current.revision !== expectedRevision) {
        return Promise.reject(new CartConflictError())
      }
      stored.set(userId, {
        userId,
        items: structuredClone([...items]),
        revision: current.revision + 1,
        updatedAt,
      })
      return Promise.resolve()
    },

    delete(userId) {
      stored.delete(userId)
      return Promise.resolve()
    },
  }

  return { repository, stored }
}
