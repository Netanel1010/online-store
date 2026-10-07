import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler, type ErrorBody } from '../middleware/errorHandler.ts'
import { notFound } from '../middleware/notFound.ts'
import { listen } from '../testing/listen.ts'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../testing/memoryAuthRepositories.ts'
import { createRequireAuth, getAuth } from './middleware.ts'
import { createAuthRouter, NO_AUTH_RATE_LIMITS } from './routes.ts'
import { createAuthService, SESSION_TTL_MS } from './service.ts'
import { createLoginThrottle } from './throttle.ts'
import type { SignedIn } from './types.ts'

const MINE = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const THEIRS = { name: 'דנה', email: 'dana@example.com', password: 'Passw0rdOK' }

let clock = Date.parse('2026-01-01T10:00:00Z')
let users = createMemoryUserRepository()
let sessions = createMemorySessionRepository()
const service = {
  current: createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle(),
  }),
}

// The real routes, service and error handling over in-memory repositories, and a route of its own
// that needs a signed-in visitor, like the protected routes of later features.
const app = express()
app.use(express.json())
app.use(
  '/api/auth',
  createAuthRouter(
    {
      register: (input) => service.current.register(input),
      login: (input) => service.current.login(input),
      authenticate: (token) => service.current.authenticate(token),
      logout: (token) => service.current.logout(token),
      logoutAll: (userId) => service.current.logoutAll(userId),
    },
    NO_AUTH_RATE_LIMITS,
  ),
)
app.get(
  '/api/protected',
  createRequireAuth({ authenticate: (token) => service.current.authenticate(token) }),
  (_req, res) => {
    res.json({ who: getAuth(res).user.id })
  },
)
app.use(notFound)
app.use(errorHandler({ error: vi.fn() }))

let api: Awaited<ReturnType<typeof listen>>
beforeAll(async () => {
  api = await listen(app)
})
afterAll(() => api.close())

beforeEach(() => {
  clock = Date.parse('2026-01-01T10:00:00Z')
  users = createMemoryUserRepository()
  sessions = createMemorySessionRepository()
  service.current = createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle({ now: () => clock }),
    now: () => new Date(clock),
  })
})

const post = (path: string, body?: unknown, token?: string) =>
  fetch(`${api.url}/api/auth${path}`, {
    method: 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const signIn = async (account: typeof MINE, path: '/login' | '/register' = '/login') => {
  clock += 1000
  const response = await post(path, account)
  expect(response.status).toBe(path === '/login' ? 200 : 201)
  return (await response.json()) as SignedIn
}
const me = (token: string) =>
  fetch(`${api.url}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
const protectedRoute = (token: string) =>
  fetch(`${api.url}/api/protected`, { headers: { Authorization: `Bearer ${token}` } })

describe('POST /api/auth/logout-all', () => {
  it('ends every session of the account, on every device, and the one that asked', async () => {
    const phone = await signIn(MINE, '/register')
    const laptop = await signIn(MINE)
    const tablet = await signIn(MINE)
    for (const { token } of [phone, laptop, tablet]) expect((await me(token)).status).toBe(200)

    const response = await post('/logout-all', undefined, laptop.token)

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('cache-control')).toBe('no-store')
    for (const { token } of [phone, laptop, tablet]) {
      expect((await me(token)).status).toBe(401)
      expect((await protectedRoute(token)).status).toBe(401)
    }
    expect(sessions.stored.size).toBe(0)
  })

  it('leaves the sessions of other accounts alone', async () => {
    const mine = await signIn(MINE, '/register')
    const theirs = await signIn(THEIRS, '/register')

    await post('/logout-all', undefined, mine.token)

    expect((await me(mine.token)).status).toBe(401)
    expect((await me(theirs.token)).status).toBe(200)
  })

  it('does not stop the account from signing in again afterwards', async () => {
    const before = await signIn(MINE, '/register')
    await post('/logout-all', undefined, before.token)

    const after = await signIn(MINE)

    expect(after.token).not.toBe(before.token)
    expect((await me(after.token)).status).toBe(200)
    expect((await me(before.token)).status).toBe(401)
  })

  it('needs a signed-in visitor: no token, a wrong one and a malformed one are all a 401', async () => {
    const { token } = await signIn(MINE, '/register')

    const none = await post('/logout-all')
    const wrong = await post('/logout-all', undefined, 'A'.repeat(43))
    const malformed = await post('/logout-all', undefined, 'not a token')

    for (const response of [none, wrong, malformed]) {
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toBe('Bearer')
      expect(((await response.json()) as ErrorBody).error.code).toBe('unauthorized')
    }
    // Nothing was ended by them.
    expect((await me(token)).status).toBe(200)
  })

  it('is refused for a token that has already been ended, so it cannot be used to end the others', async () => {
    const phone = await signIn(MINE, '/register')
    const laptop = await signIn(MINE)
    await post('/logout', undefined, phone.token)

    const response = await post('/logout-all', undefined, phone.token)

    expect(response.status).toBe(401)
    expect((await me(laptop.token)).status).toBe(200)
  })

  it('is refused for a token that has expired', async () => {
    const { token } = await signIn(MINE, '/register')
    clock += SESSION_TTL_MS

    expect((await post('/logout-all', undefined, token)).status).toBe(401)
  })

  it('is only a POST', async () => {
    const { token } = await signIn(MINE, '/register')

    const response = await fetch(`${api.url}/api/auth/logout-all`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(response.status).toBe(404)
    expect((await me(token)).status).toBe(200)
  })

  it('ending one session does not end the others, which is what makes it a different thing', async () => {
    const phone = await signIn(MINE, '/register')
    const laptop = await signIn(MINE)

    await post('/logout', undefined, phone.token)

    expect((await me(phone.token)).status).toBe(401)
    expect((await me(laptop.token)).status).toBe(200)
  })
})

describe('the limit on sessions, seen from outside', () => {
  it('ends the oldest session when an account signs in on one browser too many', async () => {
    service.current = createAuthService({
      users: users.repository,
      sessions: sessions.repository,
      throttle: createLoginThrottle(),
      now: () => new Date(clock),
      maxSessionsPerUser: 2,
    })
    const first = await signIn(MINE, '/register')
    const second = await signIn(MINE)

    const third = await signIn(MINE)

    expect((await me(first.token)).status).toBe(401)
    expect((await me(second.token)).status).toBe(200)
    expect((await me(third.token)).status).toBe(200)
  })
})
