import { Router } from 'express'
import { createRequireAuth, getAuth } from './middleware.ts'
import { parseLoginBody, parseRegisterBody } from './schemas.ts'
import type { AuthService } from './service.ts'
import { readBearerToken } from './tokens.ts'

/** HTTP only: read the request, call the service, send what it returns. */
export function createAuthRouter(service: AuthService) {
  const router = Router()
  const requireAuth = createRequireAuth(service)

  // A token, or the answer to "who am I", must never be kept by a browser or a proxy.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })

  router.post('/register', async (req, res) => {
    res.status(201).json(await service.register(parseRegisterBody(req.body)))
  })

  router.post('/login', async (req, res) => {
    res.json(await service.login(parseLoginBody(req.body)))
  })

  // Ends the session of the token it is given. It does not insist on a valid one: a visitor whose
  // session has already ended (or never was) is signed out all the same, and nothing is revealed.
  router.post('/logout', async (req, res) => {
    const token = readBearerToken(req.headers.authorization)
    if (token !== null) await service.logout(token)
    res.status(204).end()
  })

  router.get('/me', requireAuth, (_req, res) => {
    res.json({ user: getAuth(res).user })
  })

  return router
}
