import {
  DuplicateIdempotencyKeyError,
  DuplicateOrderNumberError,
  type OrderRepository,
} from '../orders/repository.ts'
import type { Order } from '../orders/types.ts'

/**
 * An `OrderRepository` that keeps the orders in memory, with the behaviour the real one has: the
 * order number is unique, so is the pair of account and idempotency key, an order is only ever found
 * by the account it belongs to, and a list is the newest first (a later insertion is the newer one
 * when two orders have the same time, like the id breaks a tie in the real repository). It lets the
 * service, the routes and the end-to-end tests run without MongoDB. The real repository is checked
 * against MongoDB by the optional integration test.
 */
export function createMemoryOrderRepository() {
  const stored: Order[] = []

  const repository: OrderRepository = {
    ensureIndexes: () => Promise.resolve(),

    create(order) {
      // The key is checked first, like MongoDB reports the first index that is broken in the order
      // they were made; the service handles both the same way.
      if (
        stored.some(
          (existing) =>
            existing.userId === order.userId && existing.idempotencyKey === order.idempotencyKey,
        )
      ) {
        return Promise.reject(new DuplicateIdempotencyKeyError())
      }
      if (stored.some((existing) => existing.orderNumber === order.orderNumber)) {
        return Promise.reject(new DuplicateOrderNumberError())
      }
      stored.push(structuredClone(order))
      return Promise.resolve()
    },

    findByOrderNumber(userId, orderNumber) {
      const found = stored.find(
        (order) => order.userId === userId && order.orderNumber === orderNumber,
      )
      return Promise.resolve(found ? structuredClone(found) : null)
    },

    findByIdempotencyKey(userId, idempotencyKey) {
      const found = stored.find(
        (order) => order.userId === userId && order.idempotencyKey === idempotencyKey,
      )
      return Promise.resolve(found ? structuredClone(found) : null)
    },

    listForUser(userId, { skip, limit }) {
      const own = stored
        .map((order, position) => ({ order, position }))
        .filter(({ order }) => order.userId === userId)
        .sort(
          (a, b) =>
            b.order.createdAt.getTime() - a.order.createdAt.getTime() || b.position - a.position,
        )
      return Promise.resolve({
        items: own.slice(skip, skip + limit).map(({ order }) => structuredClone(order)),
        total: own.length,
      })
    },
  }

  return { repository, stored }
}
