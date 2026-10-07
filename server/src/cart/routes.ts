import { Router, type RequestHandler } from 'express'
import { getAuth } from '../auth/middleware.ts'
import { createRateLimiter, type RateLimitOptions } from '../middleware/rateLimit.ts'
import { parseProductId } from '../products/schemas.ts'
import { parseAddItemBody, parseSetQuantityBody } from './schemas.ts'
import type { CartService } from './service.ts'

/** How often one client may change a cart. `null`: no limit. */
export interface CartRateLimits {
  write: RateLimitOptions | null
}

/**
 * Generous for a person (every click on "add to cart" is a change) and small for a script. A shared
 * address (a school, an office) shares the limit.
 */
export const CART_RATE_LIMITS: CartRateLimits = {
  write: { max: 300, windowMs: 15 * 60 * 1000 },
}

/** For tests and local stubs that change a cart far more often than a person would. */
export const NO_CART_RATE_LIMITS: CartRateLimits = { write: null }

/**
 * HTTP only: read the request, call the service, send what it returns. `requireAuth` is the
 * middleware of `createRequireAuth`: every route here needs a signed-in visitor, and the cart is
 * always the one of the session's account, never one named in the request. Every answer is the
 * whole cart as it is after the change.
 */
export function createCartRouter(
  service: CartService,
  requireAuth: RequestHandler,
  limits: CartRateLimits = CART_RATE_LIMITS,
) {
  const router = Router()
  // The limit comes first, so a flood of requests is stopped before it costs a database lookup.
  const write = limits.write ? [createRateLimiter(limits.write)] : []

  // What someone has put in a cart is theirs: a browser or a proxy must never keep it.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.get('/', requireAuth, async (_req, res) => {
    res.json(await service.get(getAuth(res).user.id))
  })

  router.delete('/', ...write, requireAuth, async (_req, res) => {
    res.json(await service.clear(getAuth(res).user.id))
  })

  router.post('/items', ...write, requireAuth, async (req, res) => {
    res.json(await service.add(getAuth(res).user.id, parseAddItemBody(req.body)))
  })

  router.put('/items/:productId', ...write, requireAuth, async (req, res) => {
    const productId = parseProductId(req.params.productId)
    const quantity = parseSetQuantityBody(req.body)
    res.json(await service.setQuantity(getAuth(res).user.id, productId, quantity))
  })

  router.delete('/items/:productId', ...write, requireAuth, async (req, res) => {
    res.json(await service.remove(getAuth(res).user.id, parseProductId(req.params.productId)))
  })

  return router
}
