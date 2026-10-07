import { Router } from 'express'
import { createRateLimiter, type RateLimitOptions } from '../middleware/rateLimit.ts'
import { createRequireAuth, getAuth } from './middleware.ts'
import { parseLoginBody, parseRegisterBody } from './schemas.ts'
import type { AuthService } from './service.ts'
import { readBearerToken } from './tokens.ts'

/** How often one client may call the two routes that hash a password. `null`: no limit. */
export interface AuthRateLimits {
  login: RateLimitOptions | null
  register: RateLimitOptions | null
}

/**
 * Every attempt counts, successful or not: what the limit protects is the cost of hashing. They are
 * generous for a person (a few mistakes, a second device) and small for a script. A shared address
 * (a school, an office) shares the limit, which is why the registration one is not smaller.
 */
export const AUTH_RATE_LIMITS: AuthRateLimits = {
  login: { max: 30, windowMs: 15 * 60 * 1000 },
  register: { max: 10, windowMs: 60 * 60 * 1000 },
}

/** For tests and local stubs that sign in far more often than a person would. */
export const NO_AUTH_RATE_LIMITS: AuthRateLimits = { login: null, register: null }

const limitedBy = (options: RateLimitOptions | null) =>
  options ? [createRateLimiter(options)] : []

/** HTTP only: read the request, call the service, send what it returns. */
export function createAuthRouter(service: AuthService, limits: AuthRateLimits = AUTH_RATE_LIMITS) {
  const router = Router()
  const requireAuth = createRequireAuth(service)

  // A token, or the answer to "who am I", must never be kept by a browser or a proxy.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.post('/register', ...limitedBy(limits.register), async (req, res) => {
    res.status(201).json(await service.register(parseRegisterBody(req.body)))
  })

  router.post('/login', ...limitedBy(limits.login), async (req, res) => {
    res.json(await service.login(parseLoginBody(req.body)))
  })

  // Ends the session of the token it is given. It does not insist on a valid one: a visitor whose
  // session has already ended (or never was) is signed out all the same, and nothing is revealed.
  router.post('/logout', async (req, res) => {
    const token = readBearerToken(req.headers.authorization)
    if (token !== null) await service.logout(token)
    res.status(204).end()
  })

  // Ends every session of the account the token belongs to, on every device, and the one that asks
  // too. It needs a live session: ending all of them is not something to do with a token that is
  // already over, and it must never end somebody else's.
  router.post('/logout-all', requireAuth, async (_req, res) => {
    await service.logoutAll(getAuth(res).user.id)
    res.status(204).end()
  })

  router.get('/me', requireAuth, (_req, res) => {
    res.json({ user: getAuth(res).user })
  })

  return router
}
