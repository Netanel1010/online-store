import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createConcurrencyGate } from '../lib/concurrencyGate.ts'
import { errorHandler, type ErrorBody } from '../middleware/errorHandler.ts'
import { notFound } from '../middleware/notFound.ts'
import { listen } from '../testing/listen.ts'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../testing/memoryAuthRepositories.ts'
import { createAuthRouter, type AuthRateLimits } from './routes.ts'
import { createAuthService } from './service.ts'
import { createLoginThrottle } from './throttle.ts'

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }
const LIMITS: AuthRateLimits = {
  login: { max: 3, windowMs: 60_000 },
  register: { max: 2, windowMs: 60_000 },
}

const open: { close: () => Promise<void> }[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map((server) => server.close()))
})

/** The real auth routes and service over in-memory repositories, behind `trustProxyHops` proxies. */
async function startApi({
  trustProxyHops = 0,
  limits = LIMITS,
  hashGate,
}: {
  trustProxyHops?: number
  limits?: AuthRateLimits
  hashGate?: ReturnType<typeof createConcurrencyGate>
} = {}) {
  const service = createAuthService({
    users: createMemoryUserRepository().repository,
    sessions: createMemorySessionRepository().repository,
    throttle: createLoginThrottle(),
    ...(hashGate && { hashGate }),
  })
  const hashes = vi.spyOn(service, 'login')
  const app = express()
  if (trustProxyHops) app.set('trust proxy', trustProxyHops)
  app.use(express.json())
  app.use('/api/auth', createAuthRouter(service, limits))
  app.use(notFound)
  app.use(errorHandler({ error: () => {} }))
  const server = await listen(app)
  open.push(server)

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${server.url}/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  const login = (password = 'wrong-Password1', headers?: Record<string, string>) =>
    post('/login', { email: GOOD.email, password }, headers)
  const register = (n: number, headers?: Record<string, string>) =>
    post('/register', { ...GOOD, email: `user${n}@example.com` }, headers)
  return { server, post, login, register, service, hashes }
}

describe('limits per address on the routes that hash a password', () => {
  it('refuses the login after the limit with a 429, a Retry-After and the usual error shape', async () => {
    const { login } = await startApi()
    for (let i = 0; i < 3; i += 1) expect((await login()).status).toBe(401)

    const refused = await login()

    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(Number(refused.headers.get('retry-after'))).toBeLessThanOrEqual(60)
    expect(await refused.json()).toEqual({
      error: { code: 'rate_limited', message: 'Too many requests. Try again later' },
    } satisfies ErrorBody)
  })

  it('does not even look at the account for a request it refuses, so it costs no hashing', async () => {
    const { login, hashes } = await startApi()
    for (let i = 0; i < 3; i += 1) await login()
    expect(hashes).toHaveBeenCalledTimes(3)

    for (let i = 0; i < 5; i += 1) expect((await login()).status).toBe(429)

    expect(hashes).toHaveBeenCalledTimes(3)
  })

  it('counts a successful sign-in too: the cost is the hashing, not the mistake', async () => {
    const { post } = await startApi({
      limits: { login: { max: 2, windowMs: 60_000 }, register: null },
    })
    await post('/register', GOOD)
    const signIn = () => post('/login', { email: GOOD.email, password: GOOD.password })

    expect((await signIn()).status).toBe(200)
    expect((await signIn()).status).toBe(200)
    const refused = await signIn()

    expect(refused.status).toBe(429)
    expect(((await refused.json()) as ErrorBody).error.code).toBe('rate_limited')
  })

  it('limits registration on its own, apart from sign-in', async () => {
    const { register, login } = await startApi()
    expect((await register(1)).status).toBe(201)
    expect((await register(2)).status).toBe(201)

    const refused = await register(3)

    expect(refused.status).toBe(429)
    expect(((await refused.json()) as ErrorBody).error.code).toBe('rate_limited')
    // The sign-in limit has not been used.
    expect((await login()).status).toBe(401)
  })

  it('does not limit the cheap routes: who am I, and sign out', async () => {
    const { server } = await startApi()
    for (let i = 0; i < 20; i += 1) {
      expect((await fetch(`${server.url}/api/auth/me`)).status).toBe(401)
      expect((await fetch(`${server.url}/api/auth/logout`, { method: 'POST' })).status).toBe(204)
    }
  })

  it('can be switched off for a route with null', async () => {
    const { post } = await startApi({ limits: { login: null, register: null } })

    // A different email each time, so the limit on one email's failures is not what is tested.
    for (let i = 0; i < 10; i += 1) {
      const answer = await post('/login', {
        email: `nobody${i}@example.com`,
        password: 'Whatever1',
      })
      expect(answer.status).toBe(401)
    }
  })
})

describe('the address a limit counts', () => {
  it('is the socket address when no proxy is trusted, whatever X-Forwarded-For says', async () => {
    const { login } = await startApi({ trustProxyHops: 0 })
    for (let i = 0; i < 3; i += 1) {
      await login('x-Password1', { 'X-Forwarded-For': `10.0.0.${i + 1}` })
    }

    const refused = await login('x-Password1', { 'X-Forwarded-For': '10.0.0.99' })

    expect(refused.status).toBe(429)
  })

  it('is the visitor the trusted proxy saw: another visitor is counted on their own', async () => {
    const { login } = await startApi({ trustProxyHops: 1 })
    for (let i = 0; i < 3; i += 1) await login('x-Password1', { 'X-Forwarded-For': '198.51.100.1' })

    expect((await login('x-Password1', { 'X-Forwarded-For': '198.51.100.1' })).status).toBe(429)
    expect((await login('x-Password1', { 'X-Forwarded-For': '198.51.100.2' })).status).toBe(401)
  })

  it('cannot be chosen by the visitor: only what the trusted proxy appended counts', async () => {
    const { login } = await startApi({ trustProxyHops: 1 })
    // The visitor sends their own list; the proxy appends the real address (198.51.100.1) last.
    for (let i = 0; i < 3; i += 1) {
      await login('x-Password1', { 'X-Forwarded-For': `203.0.113.${i + 1}, 198.51.100.1` })
    }

    const refused = await login('x-Password1', { 'X-Forwarded-For': '203.0.113.200, 198.51.100.1' })

    expect(refused.status).toBe(429)
  })

  it('counts two proxies deep when two are trusted', async () => {
    const { login } = await startApi({ trustProxyHops: 2 })
    // visitor, then the first proxy appended by the second: "client, proxy1" -> client is the visitor.
    for (let i = 0; i < 3; i += 1) {
      await login('x-Password1', { 'X-Forwarded-For': '198.51.100.7, 192.0.2.1' })
    }

    expect(
      (await login('x-Password1', { 'X-Forwarded-For': '198.51.100.7, 192.0.2.99' })).status,
    ).toBe(429)
    expect(
      (await login('x-Password1', { 'X-Forwarded-For': '198.51.100.8, 192.0.2.1' })).status,
    ).toBe(401)
  })
})

describe('protection against hashing in bulk', () => {
  it('turns away the sign-ups beyond what the hashing line can hold, with a 503 and a Retry-After', async () => {
    const { register } = await startApi({
      limits: { login: null, register: null },
      hashGate: createConcurrencyGate({ maxConcurrent: 1, maxQueued: 1, retryAfterSeconds: 2 }),
    })

    // Six at once: one hashes, one waits, the other four are turned away.
    const answers = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => register(n)))
    const statuses = answers.map((answer) => answer.status).sort()

    expect(statuses.filter((status) => status === 201)).toHaveLength(2)
    expect(statuses.filter((status) => status === 503)).toHaveLength(4)
    const busy = answers.find((answer) => answer.status === 503)!
    expect(busy.headers.get('retry-after')).toBe('2')
    expect(await busy.json()).toEqual({
      error: { code: 'server_busy', message: 'The server is busy. Try again in a moment' },
    })
  })

  it('works again as soon as the line has cleared', async () => {
    const { register } = await startApi({
      limits: { login: null, register: null },
      hashGate: createConcurrencyGate({ maxConcurrent: 1, maxQueued: 0 }),
    })
    await Promise.all([1, 2, 3].map((n) => register(n)))

    expect((await register(10)).status).toBe(201)
  })

  it('turns away a sign-in on the same terms, without telling whether the account exists', async () => {
    const gate = createConcurrencyGate({ maxConcurrent: 1, maxQueued: 0 })
    const { post } = await startApi({ limits: { login: null, register: null }, hashGate: gate })
    await post('/register', GOOD)

    const answers = await Promise.all(
      ['a@example.com', GOOD.email, 'b@example.com'].map((email) =>
        post('/login', { email, password: 'Whatever1' }),
      ),
    )

    const codes = await Promise.all(
      answers.map(async (a) => ((await a.json()) as ErrorBody).error.code),
    )
    expect(codes.filter((code) => code === 'server_busy')).toHaveLength(2)
    expect(codes.filter((code) => code === 'invalid_credentials')).toHaveLength(1)
  })
})
