import { createHash } from 'node:crypto'
import { HttpError } from '../lib/httpError.ts'
import type { ProductRepository } from '../products/repository.ts'
import { DEFAULT_LIMIT, invalidPagination, MAX_LIMIT } from '../products/service.ts'
import { generateOrderNumber } from './orderNumber.ts'
import {
  DuplicateIdempotencyKeyError,
  DuplicateOrderNumberError,
  type OrderRepository,
} from './repository.ts'
import { orderNotFound, type PlaceOrderInput } from './schemas.ts'
import type { Order, OrderLine, OrderPage, PublicOrder } from './types.ts'

/** How many order numbers are tried before giving up: a coincidence twice in a row is already absurd. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5

export interface OrderService {
  /**
   * Places an order for an account. `created` is false when the same request (the same idempotency
   * key and the same content) was placed before: the order that exists is returned and nothing new
   * is made.
   */
  place(
    userId: string,
    input: PlaceOrderInput,
    idempotencyKey: string,
  ): Promise<{ order: PublicOrder; created: boolean }>
  /** One of the account's own orders. Anyone else's, and one that does not exist, are the same 404. */
  get(userId: string, orderNumber: string): Promise<PublicOrder>
  /** The account's orders, the newest first. */
  list(userId: string, params?: { page?: number; limit?: number }): Promise<OrderPage>
}

interface Dependencies {
  orders: OrderRepository
  products: Pick<ProductRepository, 'findByIds'>
  now?: () => Date
  /** Draws an order number (default: a random one, see `orderNumber.ts`). */
  generateOrderNumber?: () => string
}

const toPublic = (order: Order): PublicOrder => ({
  orderNumber: order.orderNumber,
  createdAt: order.createdAt.toISOString(),
  status: order.status,
  lines: order.lines,
  total: order.total,
  originalTotal: order.originalTotal,
  savings: order.savings,
  delivery: order.delivery,
})

/**
 * A digest of what a request asks for (the products, the quantities and the delivery details), the
 * same whatever order the products were listed in. It is how a retry of a request is told from a
 * different request that reuses its idempotency key. It does not cover `expectedTotal`: that is
 * what the visitor saw, not what was ordered.
 */
function hashRequest({ items, delivery }: PlaceOrderInput): string {
  const sorted = [...items].sort((a, b) => (a.productId < b.productId ? -1 : 1))
  return createHash('sha256')
    .update(JSON.stringify({ items: sorted, delivery }))
    .digest('hex')
}

const keyReused = () =>
  new HttpError(
    409,
    'idempotency_key_reuse',
    'This Idempotency-Key was already used for a different order',
  )

/**
 * The rules of orders: what an order costs, when it can be placed, and what a retry means. It talks
 * to the repositories, never to MongoDB, and knows nothing about Express. A failure the client
 * caused is thrown as an `HttpError`, so the central error handler answers it.
 *
 * The client says which products and how many, and where to send them. Everything else comes from
 * the server: the names and prices are read from the products here and stored in the order, and the
 * amounts are worked out here, in whole shekels, so a price edited in a browser or a stale page
 * can change nothing. There are no transactions: an order is one document written once, and the
 * unique indexes are what make a repeated request safe.
 */
export function createOrderService({
  orders,
  products,
  now = () => new Date(),
  generateOrderNumber: draw = generateOrderNumber,
}: Dependencies): OrderService {
  /** The order that was placed before, if it is the same request; otherwise the key is misused. */
  function replay(existing: Order, requestHash: string) {
    if (existing.requestHash !== requestHash) throw keyReused()
    return { order: toPublic(existing), created: false }
  }

  return {
    async place(userId, input, idempotencyKey) {
      const requestHash = hashRequest(input)

      // A request that was placed before gets its order back, even if prices have changed since:
      // the order exists, and the visitor must not be told it failed.
      const placed = await orders.findByIdempotencyKey(userId, idempotencyKey)
      if (placed) return replay(placed, requestHash)

      const found = await products.findByIds(input.items.map((item) => item.productId))
      const byId = new Map(found.map((product) => [product.id, product]))
      const unavailable = input.items
        .map((item) => item.productId)
        .filter((productId) => !byId.has(productId))
      if (unavailable.length > 0) {
        throw new HttpError(
          409,
          'product_unavailable',
          'Some of the products are not available',
          {},
          { productIds: unavailable },
        )
      }

      const lines: OrderLine[] = input.items.map(({ productId, quantity }) => {
        const { name, price } = byId.get(productId)!
        return {
          productId,
          name,
          unitPrice: price.current,
          // Left out, not undefined: MongoDB would store an undefined as null.
          ...(price.original !== undefined && { originalUnitPrice: price.original }),
          quantity,
        }
      })
      const total = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      const originalTotal = lines.reduce(
        (sum, line) => sum + (line.originalUnitPrice ?? line.unitPrice) * line.quantity,
        0,
      )

      if (input.expectedTotal !== undefined && input.expectedTotal !== total) {
        throw new HttpError(
          409,
          'price_changed',
          'The total is not what you were shown',
          {},
          { expectedTotal: input.expectedTotal, total },
        )
      }

      const createdAt = now()
      for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt += 1) {
        const order: Order = {
          orderNumber: draw(),
          userId,
          idempotencyKey,
          requestHash,
          createdAt,
          status: 'placed',
          lines,
          total,
          originalTotal,
          savings: originalTotal - total,
          delivery: input.delivery,
        }
        try {
          await orders.create(order)
          return { order: toPublic(order), created: true }
        } catch (error) {
          if (error instanceof DuplicateIdempotencyKeyError) {
            // The same request was placed at the same moment, and the other one won: its order is
            // the answer. (It can only be missing if it was deleted in between, which nothing does.)
            const winner = await orders.findByIdempotencyKey(userId, idempotencyKey)
            if (winner) return replay(winner, requestHash)
          }
          if (error instanceof DuplicateOrderNumberError) continue
          throw error
        }
      }
      throw new Error('No free order number was found')
    },

    async get(userId, orderNumber) {
      const order = await orders.findByOrderNumber(userId, orderNumber)
      if (!order) throw orderNotFound()
      return toPublic(order)
    },

    async list(userId, { page = 1, limit = DEFAULT_LIMIT } = {}) {
      const skip = (page - 1) * limit
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_LIMIT ||
        !Number.isSafeInteger(skip)
      ) {
        throw invalidPagination()
      }
      const { items, total } = await orders.listForUser(userId, { skip, limit })
      return {
        items: items.map(toPublic),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    },
  }
}
