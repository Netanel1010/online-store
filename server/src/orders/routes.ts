import { Router, type RequestHandler } from 'express'
import { getAuth } from '../auth/middleware.ts'
import { createRateLimiter, type RateLimitOptions } from '../middleware/rateLimit.ts'
import { parsePaginationQuery } from '../products/schemas.ts'
import {
  parseAttemptNumber,
  parseEmptyBody,
  parseIdempotencyKey,
  parseLookupBody,
  parseOrderNumber,
  parsePlaceOrderBody,
  parseStartPaymentBody,
} from './schemas.ts'
import type { OrderService } from './service.ts'

/** How often one client may place orders, and act on payments. `null`: no limit. */
export interface OrderRateLimits {
  place: RateLimitOptions | null
  /** One limit for starting, cancelling and refunding, together. */
  payment: RateLimitOptions | null
}

/**
 * Generous for a person (an order is a rare, deliberate act, and a retry after a timeout counts
 * too) and small for a script. A shared address (a school, an office) shares the limit. A person
 * trying the payment scenarios of a few orders stays far below 30 an hour.
 */
export const ORDER_RATE_LIMITS: OrderRateLimits = {
  place: { max: 20, windowMs: 60 * 60 * 1000 },
  payment: { max: 30, windowMs: 60 * 60 * 1000 },
}

/** For tests and local stubs that place far more orders than a person would. */
export const NO_ORDER_RATE_LIMITS: OrderRateLimits = { place: null, payment: null }

/**
 * HTTP only: read the request, call the service, send what it returns. `requireAuth` is the
 * middleware of `createRequireAuth`: every route here needs a signed-in visitor, and the account is
 * always the one of the session, never one named in the request.
 */
export function createOrdersRouter(
  service: OrderService,
  requireAuth: RequestHandler,
  limits: OrderRateLimits = ORDER_RATE_LIMITS,
) {
  const router = Router()

  // An order holds a name, a phone number and an address: a browser or a proxy must never keep one.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  // The limit comes first, so a flood of requests is stopped before it costs a database lookup.
  router.post(
    '/',
    ...(limits.place ? [createRateLimiter(limits.place)] : []),
    requireAuth,
    async (req, res) => {
      const idempotencyKey = parseIdempotencyKey(req.headers['idempotency-key'])
      const input = parsePlaceOrderBody(req.body)
      const { order, created } = await service.place(getAuth(res).user.id, input, idempotencyKey)
      // 201 for the order that was just made, 200 for the same order given again to a retry.
      res.status(created ? 201 : 200).json(order)
    },
  )

  // Asks whether an attempt made an order: for a checkout whose request may have arrived while its
  // answer was lost. A POST with the key in the body, so the key is in no address and no log; it is a
  // read (nothing is made), answered 200 with the order or 404 `order_not_found`. Like the other
  // reads it has no limit of its own: it needs a live session and only ever finds the account's own.
  router.post('/lookup', requireAuth, async (req, res) => {
    const idempotencyKey = parseLookupBody(req.body)
    res.json(await service.lookup(getAuth(res).user.id, idempotencyKey))
  })

  router.get('/', requireAuth, async (req, res) => {
    res.json(await service.list(getAuth(res).user.id, parsePaginationQuery(req.query)))
  })

  // Reading an order may store a payment decision that has become due (ADR 0014): the result was
  // already decided by what is stored and by the database's clock, and storing it first is what keeps
  // a result that was shown from being undone. A repeat of the request changes nothing more.
  router.get('/:orderNumber', requireAuth, async (req, res) => {
    res.json(await service.get(getAuth(res).user.id, parseOrderNumber(req.params.orderNumber)))
  })

  // The simulated payment. The client says only which scenario the fictional provider follows, once,
  // when it starts an attempt; it never says a status or an outcome, and a body with any other field
  // is refused. One limiter for the three, so they share one count.
  const paymentLimit = limits.payment ? [createRateLimiter(limits.payment)] : []

  router.post('/:orderNumber/payment/attempts', ...paymentLimit, requireAuth, async (req, res) => {
    const orderNumber = parseOrderNumber(req.params.orderNumber)
    const idempotencyKey = parseIdempotencyKey(req.headers['idempotency-key'])
    const scenario = parseStartPaymentBody(req.body)
    const { order, created } = await service.startPayment(
      getAuth(res).user.id,
      orderNumber,
      idempotencyKey,
      scenario,
    )
    res.status(created ? 201 : 200).json(order)
  })

  router.post(
    '/:orderNumber/payment/attempts/:attemptNumber/cancel',
    ...paymentLimit,
    requireAuth,
    async (req, res) => {
      const orderNumber = parseOrderNumber(req.params.orderNumber)
      const attemptNumber = parseAttemptNumber(req.params.attemptNumber)
      parseEmptyBody(req.body)
      res.json(await service.cancelPayment(getAuth(res).user.id, orderNumber, attemptNumber))
    },
  )

  router.post('/:orderNumber/payment/refund', ...paymentLimit, requireAuth, async (req, res) => {
    const orderNumber = parseOrderNumber(req.params.orderNumber)
    parseEmptyBody(req.body)
    res.json(await service.refundPayment(getAuth(res).user.id, orderNumber))
  })

  return router
}
