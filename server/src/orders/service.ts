import { createHash } from 'node:crypto'
import type { PaymentScenario } from '../../../src/features/orders/payment.ts'
import { HttpError } from '../lib/httpError.ts'
import type { ProductRepository } from '../products/repository.ts'
import { DEFAULT_LIMIT, invalidPagination, MAX_LIMIT } from '../products/service.ts'
import { generateOrderNumber } from './orderNumber.ts'
import {
  checkTimings,
  commandTime,
  decideCancel,
  decideRefund,
  decideStart,
  DEMO_PAYMENT_TIMINGS,
  expectationOf,
  initialPayment,
  settleDue,
  toPublicPayment,
  type PaymentDecision,
  type PaymentTimings,
  type StoredPayment,
} from './payment.ts'
import {
  DuplicateIdempotencyKeyError,
  DuplicateOrderNumberError,
  WriteNotConfirmedError,
  type OrderRepository,
} from './repository.ts'
import {
  databaseUnavailable,
  orderNotConfirmed,
  orderNotFound,
  writeNotConfirmed,
  type PlaceOrderInput,
} from './schemas.ts'
import type { Order, OrderLine, OrderPage, PublicOrder } from './types.ts'

/** How many order numbers are tried before giving up: a coincidence twice in a row is already absurd. */
const MAX_ORDER_NUMBER_ATTEMPTS = 5

/** How many times one request tries to write a payment against a version another request changed. */
export const MAX_PAYMENT_WRITE_ATTEMPTS = 3

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
  /**
   * The order this account placed under an idempotency key, for a checkout that does not know
   * whether its request arrived. No such order is `404 order_not_found`; a key of another account
   * is not found either.
   */
  lookup(userId: string, idempotencyKey: string): Promise<PublicOrder>
  /**
   * One of the account's own orders. Anyone else's, and one that does not exist, are the same 404.
   * A payment decision that is due is stored before the order is shown.
   */
  get(userId: string, orderNumber: string): Promise<PublicOrder>
  /** The account's orders, the newest first, as they are stored: listing changes nothing. */
  list(userId: string, params?: { page?: number; limit?: number }): Promise<OrderPage>
  /** Starts a simulated payment attempt. `created` is false for a repeat of the same request. */
  startPayment(
    userId: string,
    orderNumber: string,
    idempotencyKey: string,
    scenario: PaymentScenario,
  ): Promise<{ order: PublicOrder; created: boolean }>
  /** Cancels an attempt that is still processing. */
  cancelPayment(userId: string, orderNumber: string, attemptNumber: number): Promise<PublicOrder>
  /** Refunds a paid order, once (simulated). */
  refundPayment(userId: string, orderNumber: string): Promise<PublicOrder>
}

interface Dependencies {
  orders: OrderRepository
  products: Pick<ProductRepository, 'findByIds'>
  /** The process clock: only for the time an order is placed and when its payment ends. */
  now?: () => Date
  /** Draws an order number (default: a random one, see `orderNumber.ts`). */
  generateOrderNumber?: () => string
  /** The timings a new order is given and keeps (default: the demo's, see `payment.ts`). */
  paymentTimings?: PaymentTimings
}

/** An order as the API shows it. `databaseNow` is only for saying that a payment change is due. */
const toPublic = (order: Order, databaseNow?: Date): PublicOrder => ({
  orderNumber: order.orderNumber,
  createdAt: order.createdAt.toISOString(),
  status: order.status,
  lines: order.lines,
  total: order.total,
  originalTotal: order.originalTotal,
  savings: order.savings,
  delivery: order.delivery,
  payment: toPublicPayment(order.orderNumber, order.payment, databaseNow),
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

/**
 * The key belongs to an order the account already has, made from a different request (the visitor
 * edited the details after an answer was lost). The order number is the account's own, and it is
 * how the storefront shows the visitor the order that exists instead of making a second one.
 */
const keyReused = (orderNumber: string) =>
  new HttpError(
    409,
    'idempotency_key_reuse',
    'This Idempotency-Key was already used for a different order',
    {},
    { orderNumber },
  )

const refusal = ({
  status,
  code,
  message,
  details,
}: Extract<PaymentDecision, { kind: 'refuse' }>['refusal']) =>
  new HttpError(status, code, message, {}, details ?? {})

/**
 * The rules of orders: what an order costs, when it can be placed, what a retry means, and how its
 * simulated payment moves. It talks to the repositories, never to MongoDB, and knows nothing about
 * Express. A failure the client caused is thrown as an `HttpError`, so the central error handler
 * answers it.
 *
 * The client says which products and how many, and where to send them. Everything else comes from
 * the server: the names and prices are read from the products here and stored in the order, and the
 * amounts are worked out here, in whole shekels, so a price edited in a browser or a stale page
 * can change nothing. There are no transactions: an order is one document, and the unique indexes and
 * the version of its payment are what make a repeated or a concurrent request safe.
 *
 * What an answer shows is what a failover cannot undo (docs/adr/0014-demo-payment-state-machine.md):
 * an order that a plain read finds is reported only once a majority read confirms it, and a payment
 * is shown only from a majority read or from this request's own write, which waited for the majority.
 * The time every payment decision is made at is the database's (`$$NOW`), never this process's.
 */
export function createOrderService({
  orders,
  products,
  now = () => new Date(),
  generateOrderNumber: draw = generateOrderNumber,
  paymentTimings = DEMO_PAYMENT_TIMINGS,
}: Dependencies): OrderService {
  checkTimings(paymentTimings)

  /** The order as a majority has it, or `503 order_not_confirmed` if the majority does not have it yet. */
  async function confirmed(userId: string, orderNumber: string) {
    let read: Awaited<ReturnType<OrderRepository['readWithClock']>>
    try {
      read = await orders.readWithClock(userId, orderNumber, { majority: true })
    } catch {
      throw databaseUnavailable()
    }
    if (!read) throw orderNotConfirmed()
    return read
  }

  /** The order that was placed before, if it is the same request; otherwise the key is misused. */
  async function replay(userId: string, existing: Order, requestHash: string) {
    const { order, databaseNow } = await confirmed(userId, existing.orderNumber)
    if (existing.requestHash !== requestHash) throw keyReused(existing.orderNumber)
    return { order: toPublic(order, databaseNow), created: false }
  }

  /**
   * Runs a payment command: read the order and the database's clock, decide at the command time, and
   * write against the version that was read. A write that does not match (another request changed the
   * payment, or the time a guard needs has passed by the database's clock) is decided again from a new
   * read, at most `MAX_PAYMENT_WRITE_ATTEMPTS` times. Only this request's own confirmed write, or a
   * majority read, is ever reported.
   */
  async function command(
    userId: string,
    orderNumber: string,
    decide: (payment: StoredPayment | undefined, at: Date) => PaymentDecision,
  ): Promise<{ order: PublicOrder; created: boolean }> {
    for (let attempt = 0; ; attempt += 1) {
      const read = await orders.readWithClock(userId, orderNumber)
      if (!read) throw orderNotFound()
      const { order, databaseNow } = read
      const at = order.payment ? commandTime(order.payment, databaseNow) : databaseNow
      const decision = decide(order.payment, at)

      if (decision.kind === 'refuse') throw refusal(decision.refusal)
      if (decision.kind === 'already') {
        // Done before, perhaps by a write that is not confirmed yet: say so only once it is.
        const majority = await confirmed(userId, orderNumber)
        if (!decision.done(majority.order.payment)) throw writeNotConfirmed()
        return { order: toPublic(majority.order, majority.databaseNow), created: false }
      }
      if (attempt >= MAX_PAYMENT_WRITE_ATTEMPTS) throw databaseUnavailable()

      const payment = order.payment!
      const next: StoredPayment = { ...decision.next, version: payment.version + 1 }
      let written: boolean
      try {
        written = await orders.updatePayment(
          userId,
          orderNumber,
          expectationOf(payment),
          decision.guards,
          next,
        )
      } catch (error) {
        if (error instanceof WriteNotConfirmedError) throw writeNotConfirmed()
        throw databaseUnavailable()
      }
      if (written)
        return { order: toPublic({ ...order, payment: next }), created: decision.created }
    }
  }

  return {
    async place(userId, input, idempotencyKey) {
      const requestHash = hashRequest(input)

      // A request that was placed before gets its order back, even if prices have changed since:
      // the order exists, and the visitor must not be told it failed.
      const placed = await orders.findByIdempotencyKey(userId, idempotencyKey)
      if (placed) return replay(userId, placed, requestHash)

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
          payment: initialPayment(createdAt, paymentTimings),
        }
        try {
          await orders.create(order)
          return { order: toPublic(order), created: true }
        } catch (error) {
          // Perhaps stored, not confirmed: a repeat of the request with the same key finds out.
          if (error instanceof WriteNotConfirmedError) throw writeNotConfirmed()
          if (error instanceof DuplicateIdempotencyKeyError) {
            // The same request was placed at the same moment, and the other one won: its order is
            // the answer, once a majority has it. (It can only be missing if it was deleted in
            // between, which nothing does.)
            const winner = await orders.findByIdempotencyKey(userId, idempotencyKey)
            if (winner) return replay(userId, winner, requestHash)
          }
          if (error instanceof DuplicateOrderNumberError) continue
          throw error
        }
      }
      throw new Error('No free order number was found')
    },

    async lookup(userId, idempotencyKey) {
      // Whether the order exists is a plain read: a majority that is behind must never turn an order
      // into "no order", which would let the checkout place a second one.
      const order = await orders.findByIdempotencyKey(userId, idempotencyKey)
      if (!order) throw orderNotFound()
      const majority = await confirmed(userId, order.orderNumber)
      return toPublic(majority.order, majority.databaseNow)
    },

    async get(userId, orderNumber) {
      let failedVersion: number | undefined
      for (let attempt = 0; ;) {
        const local = await orders.readWithClock(userId, orderNumber)
        if (!local) throw orderNotFound()
        const payment = local.order.payment
        // A write that did not match while nothing changed: its guard does not hold by the
        // database's clock yet (a clock behind the one it read). Show what is stored.
        if (payment && failedVersion === payment.version) {
          const majority = await confirmed(userId, orderNumber)
          return toPublic(majority.order, majority.databaseNow)
        }
        const majority = await confirmed(userId, orderNumber)
        if (!payment) return toPublic(majority.order, majority.databaseNow)

        const due = settleDue(orderNumber, payment, commandTime(payment, local.databaseNow))
        if (!due.changed || attempt >= MAX_PAYMENT_WRITE_ATTEMPTS) {
          return toPublic(majority.order, majority.databaseNow)
        }
        attempt += 1
        const next: StoredPayment = { ...due.payment, version: payment.version + 1 }
        try {
          const written = await orders.updatePayment(
            userId,
            orderNumber,
            expectationOf(payment),
            due.guards,
            next,
          )
          if (written) return toPublic({ ...local.order, payment: next })
        } catch {
          // Not confirmed, or not written: show what the majority has, which is never this write
          // unless it reached the majority. Asking again tries again.
          const fallback = await confirmed(userId, orderNumber)
          return toPublic(fallback.order, fallback.databaseNow)
        }
        failedVersion = payment.version
      }
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
      // From the majority, and without writing: a decision that is due is shown as due
      // (`pendingUpdate`) and stored when the order itself is opened.
      const { items, total, databaseNow } = await orders.listForUser(
        userId,
        { skip, limit },
        { majority: true },
      )
      return {
        items: items.map((order) => toPublic(order, databaseNow ?? undefined)),
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    },

    startPayment(userId, orderNumber, idempotencyKey, scenario) {
      return command(userId, orderNumber, (payment, at) =>
        decideStart(orderNumber, payment, at, idempotencyKey, scenario),
      )
    },

    async cancelPayment(userId, orderNumber, attemptNumber) {
      const { order } = await command(userId, orderNumber, (payment, at) =>
        decideCancel(orderNumber, payment, at, attemptNumber),
      )
      return order
    },

    async refundPayment(userId, orderNumber) {
      const { order } = await command(userId, orderNumber, (payment, at) =>
        decideRefund(orderNumber, payment, at),
      )
      return order
    },
  }
}
