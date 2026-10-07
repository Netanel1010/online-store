import { Router, type RequestHandler } from 'express'
import { getAuth } from '../auth/middleware.ts'
import { createRateLimiter, type RateLimitOptions } from '../middleware/rateLimit.ts'
import { parsePaginationQuery } from '../products/schemas.ts'
import { parseIdempotencyKey, parseOrderNumber, parsePlaceOrderBody } from './schemas.ts'
import type { OrderService } from './service.ts'

/** How often one client may place orders. `null`: no limit. */
export interface OrderRateLimits {
  place: RateLimitOptions | null
}

/**
 * Generous for a person (an order is a rare, deliberate act, and a retry after a timeout counts
 * too) and small for a script. A shared address (a school, an office) shares the limit.
 */
export const ORDER_RATE_LIMITS: OrderRateLimits = {
  place: { max: 20, windowMs: 60 * 60 * 1000 },
}

/** For tests and local stubs that place far more orders than a person would. */
export const NO_ORDER_RATE_LIMITS: OrderRateLimits = { place: null }

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

  router.get('/', requireAuth, async (req, res) => {
    res.json(await service.list(getAuth(res).user.id, parsePaginationQuery(req.query)))
  })

  router.get('/:orderNumber', requireAuth, async (req, res) => {
    res.json(await service.get(getAuth(res).user.id, parseOrderNumber(req.params.orderNumber)))
  })

  return router
}
