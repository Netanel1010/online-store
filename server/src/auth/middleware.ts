import type { RequestHandler, Response } from 'express'
import { HttpError } from '../lib/httpError.ts'
import type { AuthService } from './service.ts'
import { readBearerToken } from './tokens.ts'
import type { AuthContext } from './types.ts'

/**
 * The one answer to a request that needs a signed-in visitor and does not have one: no token, a
 * token that is malformed, unknown, expired or ended all look the same from outside.
 */
export const unauthorized = () =>
  new HttpError(401, 'unauthorized', 'Authentication is required', {
    'WWW-Authenticate': 'Bearer',
  })

/**
 * Middleware for every route that needs a signed-in visitor: it reads `Authorization: Bearer
 * <token>`, asks the service whether it is a live session, and makes the account available to the
 * route with `getAuth`. A request without one never reaches the route.
 *
 * It is the security boundary: the storefront hides screens from signed-out visitors, but only
 * this decides what the API gives them.
 */
export function createRequireAuth(service: Pick<AuthService, 'authenticate'>): RequestHandler {
  return async (req, res, next) => {
    const token = readBearerToken(req.headers.authorization)
    if (token === null) throw unauthorized()

    const context = await service.authenticate(token)
    if (context === null) throw unauthorized()

    res.locals.auth = context
    next()
  }
}

/** The account of an authenticated request. Only for routes behind `createRequireAuth`. */
export function getAuth(res: Response): AuthContext {
  const context = res.locals.auth as AuthContext | undefined
  // A route that asks without the middleware in front of it is a bug, not a client error.
  if (!context) throw new Error('getAuth was used on a route without requireAuth')
  return context
}
