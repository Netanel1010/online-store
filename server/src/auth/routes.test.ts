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
import { hashToken } from './tokens.ts'
import type { SignedIn } from './types.ts'

const logger = { error: vi.fn() }
const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

let users = createMemoryUserRepository()
let sessions = createMemorySessionRepository()
let clock = Date.parse('2026-01-01T10:00:00Z')

// The real routes, service, middleware and error handling over in-memory repositories, with a
// route of its own that needs a signed-in visitor, like the protected routes of later features.
const service = {
  current: createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle(),
  }),
}
const app = express()
app.use(express.json({ limit: '100kb' }))
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
    // These tests sign in far more often than a person; the limits have tests of their own.
    NO_AUTH_RATE_LIMITS,
  ),
)
app.get(
  '/api/protected',
  createRequireAuth({ authenticate: (token) => service.current.authenticate(token) }),
  (_req, res) => {
    res.json({ secret: 'for signed-in visitors', who: getAuth(res).user.id })
  },
)
app.use(notFound)
app.use(errorHandler(logger))

let api: Awaited<ReturnType<typeof listen>>
beforeAll(async () => {
  api = await listen(app)
})
afterAll(() => api.close())

beforeEach(() => {
  users = createMemoryUserRepository()
  sessions = createMemorySessionRepository()
  clock = Date.parse('2026-01-01T10:00:00Z')
  service.current = createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle({ now: () => clock }),
    now: () => new Date(clock),
  })
  logger.error.mockClear()
})

const send = (
  path: string,
  init: { method?: string; body?: unknown; token?: string; raw?: string } = {},
) =>
  fetch(`${api.url}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      ...(init.raw === undefined && init.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  })
const register = (body: unknown = GOOD) => send('/api/auth/register', { body })
const login = (body: unknown) => send('/api/auth/login', { body })
const me = (token?: string) => send('/api/auth/me', { method: 'GET', token })
const signedIn = async (response: Response) => (await response.json()) as SignedIn
const errorOf = async (response: Response) => ((await response.json()) as ErrorBody).error

describe('POST /api/auth/register', () => {
  it('creates the account and answers 201 with the user, a token and when the session ends', async () => {
    const response = await register()

    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    const body = await signedIn(response)
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'token', 'user'])
    expect(body.user).toEqual({ id: expect.any(String), name: GOOD.name, email: GOOD.email })
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Date.parse(body.expiresAt)).toBe(clock + SESSION_TTL_MS)
  })

  it('does not answer with the password, the hash or anything stored about the password', async () => {
    const text = await (await register()).text()

    expect(text).not.toContain(GOOD.password)
    expect(text).not.toMatch(/scrypt|passwordHash|salt/i)
  })

  it('stores a hash, never the password', async () => {
    await register()

    const [stored] = [...users.stored.values()]
    expect(stored?.passwordHash).toMatch(/^scrypt\$/)
    expect(JSON.stringify([...users.stored.values()])).not.toContain(GOOD.password)
  })

  it('keeps no-store on the answer, so a token is never cached', async () => {
    expect((await register()).headers.get('cache-control')).toBe('no-store')
  })

  it('normalizes the email, and a second registration of it, in any case, is a 409', async () => {
    await register({ ...GOOD, email: ' Netanel@Example.com ' })

    const again = await register({ ...GOOD, name: 'Other', email: 'NETANEL@example.COM' })

    expect(again.status).toBe(409)
    expect(await errorOf(again)).toEqual({
      code: 'email_taken',
      message: 'The email is already registered',
    })
    expect(users.stored.size).toBe(1)
    expect([...users.stored.values()][0]?.email).toBe('netanel@example.com')
  })

  it.each([
    ['a name that is too short', { ...GOOD, name: 'a' }],
    ['a malformed email', { ...GOOD, email: 'nope' }],
    ['a password that is too short', { ...GOOD, password: 'Ab1' }],
    ['a password without a digit', { ...GOOD, password: 'OnlyLetters' }],
    ['a password that is too long', { ...GOOD, password: `A1${'a'.repeat(200)}` }],
    ['an operator instead of the email', { ...GOOD, email: { $ne: '' } }],
  ])('answers 400 invalid_input for %s, and creates nothing', async (_name, body) => {
    const response = await register(body)

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_input')
    expect(users.stored.size).toBe(0)
    expect(sessions.stored.size).toBe(0)
  })

  it('answers 400 invalid_input when there is no body at all', async () => {
    const response = await send('/api/auth/register')

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_input')
    expect(users.stored.size).toBe(0)
  })

  it('answers 400 invalid_json for a body that is not JSON, without the password in the answer', async () => {
    const response = await send('/api/auth/register', { raw: '{"password":"Passw0rdOK",' })

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(JSON.parse(text).error.code).toBe('invalid_json')
    expect(text).not.toContain('Passw0rdOK')
  })

  it('does not take a role or an id from the request', async () => {
    const body = await signedIn(await register({ ...GOOD, id: 'chosen', role: 'admin' }))

    expect(body.user.id).not.toBe('chosen')
    expect(Object.keys([...users.stored.values()][0]!).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'passwordHash',
    ])
  })

  it('does not put the password in the log when something fails', async () => {
    vi.spyOn(users.repository, 'create').mockRejectedValue(new Error('database is down'))

    const response = await register()

    expect(response.status).toBe(500)
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Passw0rdOK')
    expect(await errorOf(response)).toEqual({
      code: 'internal_error',
      message: 'Internal server error',
    })
  })
})

describe('POST /api/auth/login', () => {
  it('answers 200 with a new token for the right credentials, whatever the case of the email', async () => {
    const registered = await signedIn(await register())

    const response = await login({ email: 'NETANEL@Example.com', password: GOOD.password })

    expect(response.status).toBe(200)
    const body = await signedIn(response)
    expect(body.user).toEqual(registered.user)
    expect(body.token).not.toBe(registered.token)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('answers 401 invalid_credentials, with the same body, for a wrong password and an unknown email', async () => {
    await register()

    const wrong = await login({ email: GOOD.email, password: 'WrongPass1' })
    const unknown = await login({ email: 'nobody@example.com', password: 'WrongPass1' })

    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(await wrong.text()).toBe(await unknown.text())
  })

  it('does not hand out a token for a failed sign-in', async () => {
    await register()
    const before = sessions.stored.size

    const text = await (await login({ email: GOOD.email, password: 'WrongPass1' })).text()

    expect(text).not.toMatch(/token/)
    expect(sessions.stored.size).toBe(before)
  })

  it.each([
    ['no body', undefined],
    ['no password', { email: GOOD.email }],
    ['a malformed email', { email: 'nope', password: 'x' }],
    ['an operator instead of the password', { email: GOOD.email, password: { $ne: '' } }],
  ])('answers 400 invalid_input for %s', async (_name, body) => {
    const response = await login(body)

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_input')
  })

  it('answers 429 with Retry-After after five wrong passwords, and again 200 when the time is over', async () => {
    await register()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await login({ email: GOOD.email, password: 'WrongPass1' })).status).toBe(401)
    }

    const blocked = await login({ email: GOOD.email, password: GOOD.password })
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('retry-after')).toBe(String(15 * 60))
    expect((await errorOf(blocked)).code).toBe('too_many_attempts')

    clock += 15 * 60 * 1000
    expect((await login({ email: GOOD.email, password: GOOD.password })).status).toBe(200)
  })
})

describe('GET /api/auth/me', () => {
  it('answers with the signed-in user, and nothing but the user', async () => {
    const { token, user } = await signedIn(await register())

    const response = await me(token)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('works with the token of a sign-in too', async () => {
    await register()
    const { token } = await signedIn(await login({ email: GOOD.email, password: GOOD.password }))

    expect((await me(token)).status).toBe(200)
  })

  it('answers 401 unauthorized, asking for a Bearer token, without a token', async () => {
    const response = await me()

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect(await errorOf(response)).toEqual({
      code: 'unauthorized',
      message: 'Authentication is required',
    })
  })

  it.each([
    ['a token that was never issued', 'a'.repeat(43)],
    ['something that is not a token', 'not-a-token'],
    ['a token that is far too long', 'a'.repeat(5000)],
  ])('answers 401 unauthorized for %s', async (_name, token) => {
    const response = await me(token)

    expect(response.status).toBe(401)
    expect((await errorOf(response)).code).toBe('unauthorized')
  })

  it('answers 401 for another kind of Authorization header', async () => {
    const { token } = await signedIn(await register())

    const response = await fetch(`${api.url}/api/auth/me`, {
      headers: { Authorization: `Basic ${token}` },
    })

    expect(response.status).toBe(401)
  })

  it('does not read the token from the URL or from the body', async () => {
    const { token } = await signedIn(await register())

    expect((await fetch(`${api.url}/api/auth/me?token=${token}`)).status).toBe(401)
    expect((await fetch(`${api.url}/api/auth/me?access_token=${token}`)).status).toBe(401)
  })

  it('answers 401 once the session has expired', async () => {
    const { token } = await signedIn(await register())

    clock += SESSION_TTL_MS - 1
    expect((await me(token)).status).toBe(200)
    clock += 1

    expect((await me(token)).status).toBe(401)
    expect(sessions.stored.size).toBe(0)
  })

  it('answers 401 for the token of an account that no longer exists', async () => {
    const { token } = await signedIn(await register())
    users.stored.clear()

    expect((await me(token)).status).toBe(401)
  })
})

describe('POST /api/auth/logout', () => {
  it('ends the session: answers 204, and the token no longer works', async () => {
    const { token } = await signedIn(await register())

    const response = await send('/api/auth/logout', { token })

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect((await me(token)).status).toBe(401)
    expect(sessions.stored.has(hashToken(token))).toBe(false)
  })

  it('ends only the session of that token', async () => {
    const first = await signedIn(await register())
    const second = await signedIn(await login({ email: GOOD.email, password: GOOD.password }))

    await send('/api/auth/logout', { token: first.token })

    expect((await me(first.token)).status).toBe(401)
    expect((await me(second.token)).status).toBe(200)
  })

  it('answers 204 without a token, with a token that is not a session, and when done twice', async () => {
    const { token } = await signedIn(await register())

    expect((await send('/api/auth/logout')).status).toBe(204)
    expect((await send('/api/auth/logout', { token: 'a'.repeat(43) })).status).toBe(204)
    expect((await send('/api/auth/logout', { token })).status).toBe(204)
    expect((await send('/api/auth/logout', { token })).status).toBe(204)
  })
})

describe('a route behind the authentication middleware', () => {
  it('lets a signed-in visitor in, and tells the route who it is', async () => {
    const { token, user } = await signedIn(await register())

    const response = await send('/api/protected', { method: 'GET', token })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ secret: 'for signed-in visitors', who: user.id })
  })

  it('keeps everyone else out, whatever they send, without running the route', async () => {
    const { token } = await signedIn(await register())
    await send('/api/auth/logout', { token })

    for (const init of [{}, { token: 'a'.repeat(43) }, { token }]) {
      const response = await send('/api/protected', { method: 'GET', ...init })

      expect(response.status).toBe(401)
      expect(await response.text()).not.toContain('signed-in visitors')
    }
  })
})

describe('an unknown route of the feature', () => {
  it('is the usual JSON 404', async () => {
    const response = await send('/api/auth/nope', { method: 'GET' })

    expect(response.status).toBe(404)
    expect((await errorOf(response)).code).toBe('not_found')
  })
})
