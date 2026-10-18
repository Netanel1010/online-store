import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequireAuth } from '../auth/middleware.ts'
import { createAuthService, SESSION_TTL_MS } from '../auth/service.ts'
import { createLoginThrottle } from '../auth/throttle.ts'
import { generateToken, hashToken } from '../auth/tokens.ts'
import { errorHandler, type ErrorBody } from '../middleware/errorHandler.ts'
import { notFound } from '../middleware/notFound.ts'
import { listen } from '../testing/listen.ts'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../testing/memoryAuthRepositories.ts'
import { createMemoryOrderRepository } from '../testing/memoryOrderRepository.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct } from '../testing/products.ts'
import { createOrdersRouter, NO_ORDER_RATE_LIMITS, ORDER_RATE_LIMITS } from './routes.ts'
import { createOrderService } from './service.ts'
import type { PublicOrder } from './types.ts'

// The payment routes, with the real router, service, authentication and error handling over
// in-memory repositories, behind a real HTTP server.
const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() }
const START = Date.parse('2026-10-20T10:00:00.000Z')
const card = makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 1500 } })
const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}

let clock = START
let users = createMemoryUserRepository()
let sessions = createMemorySessionRepository()
let orders = createMemoryOrderRepository({ now: () => new Date(clock) })
const router = { current: express.Router() }

function build(limits = NO_ORDER_RATE_LIMITS) {
  const auth = createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle(),
    now: () => new Date(clock),
  })
  router.current = createOrdersRouter(
    createOrderService({
      orders: orders.repository,
      products: createMemoryProductRepository([card]).repository,
      now: () => new Date(clock),
    }),
    createRequireAuth(auth),
    limits,
  )
}
const app = express()
app.use(express.json({ limit: '100kb' }))
app.use('/api/orders', (req, res, next) => router.current(req, res, next))
app.use(notFound)
app.use(errorHandler(logger))

let api: Awaited<ReturnType<typeof listen>>
beforeAll(async () => {
  api = await listen(app)
})
afterAll(() => api.close())

let token: string
let number: string

async function account(name: string) {
  const secret = generateToken()
  await users.repository.create({
    id: `id-${name}`,
    name,
    email: `${name}@example.com`,
    passwordHash: 'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
    createdAt: new Date(clock),
  })
  await sessions.repository.create({
    tokenHash: hashToken(secret),
    userId: `id-${name}`,
    createdAt: new Date(clock),
    expiresAt: new Date(clock + SESSION_TTL_MS),
  })
  return secret
}

const post = (
  path: string,
  options: { token?: string; key?: string | null; body?: unknown; raw?: string } = {},
) =>
  fetch(`${api.url}/api/orders${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
    },
    ...(options.raw !== undefined
      ? { body: options.raw }
      : options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
  })
const start = (scenario: unknown = 'approve', key: string | null = 'pay-key-0000000000001') =>
  post(`/${number}/payment/attempts`, { token, key, body: { scenario } })
const orderOf = async (response: Response) => (await response.json()) as PublicOrder
const errorOf = async (response: Response) => ((await response.json()) as ErrorBody).error

beforeEach(async () => {
  clock = START
  users = createMemoryUserRepository()
  sessions = createMemorySessionRepository()
  orders = createMemoryOrderRepository({ now: () => new Date(clock) })
  build()
  token = await account('netanel')
  const placed = await post('', {
    token,
    key: 'order-key-00000000001',
    body: { items: [{ productId: 'GV-N4060', quantity: 1 }], delivery: DELIVERY },
  })
  number = (await orderOf(placed)).orderNumber
})

describe('starting a simulated payment', () => {
  it('answers 201 with the order and its processing attempt, then 200 with the same one to a repeat', async () => {
    const first = await start()
    expect(first.status).toBe(201)
    expect(first.headers.get('cache-control')).toBe('no-store')
    expect((await orderOf(first)).payment!.attempts).toMatchObject([
      { number: 1, scenario: 'approve', status: 'processing' },
    ])

    const again = await start()
    expect(again.status).toBe(200)
    expect((await orderOf(again)).payment!.attempts).toHaveLength(1)
  })

  it.each([
    ['a status', { scenario: 'approve', status: 'succeeded' }, 'status'],
    ['paid', { scenario: 'approve', paid: true }, 'paid'],
    ['an outcome', { scenario: 'approve', outcome: 'approved' }, 'outcome'],
    ['a payment state', { scenario: 'approve', state: 'paid' }, 'state'],
    ['a card number', { scenario: 'approve', cardNumber: '4111111111111111' }, 'cardNumber'],
    ['a scenario it does not know', { scenario: 'steal' }, 'scenario'],
    ['no scenario', {}, 'scenario'],
  ])(
    'refuses a body with %s, naming the field and never its value',
    async (_what, payload, field) => {
      const response = await post(`/${number}/payment/attempts`, {
        token,
        key: 'pay-key-0000000000001',
        body: payload,
      })

      expect(response.status).toBe(400)
      const error = await errorOf(response)
      expect(error).toMatchObject({
        code: 'invalid_input',
        message: `The field "${field}" is not valid`,
      })
      expect(JSON.stringify(error)).not.toContain('4111')
      expect(orders.stored[0]!.payment!.attempts).toHaveLength(0)
    },
  )

  it('needs an Idempotency-Key of the usual form', async () => {
    expect((await errorOf(await start('approve', null))).code).toBe('idempotency_key_required')
    expect((await errorOf(await start('approve', 'short'))).code).toBe('invalid_idempotency_key')
  })

  it('answers 409 with the reason when the order cannot be paid', async () => {
    await start('approve')
    const active = await start('approve', 'pay-key-0000000000002')
    expect(active.status).toBe(409)
    expect((await errorOf(active)).code).toBe('payment_attempt_active')

    clock = START + 30 * 60 * 1000
    const ended = await start('approve', 'pay-key-0000000000003')
    expect(await errorOf(ended)).toMatchObject({
      code: 'payment_not_open',
      details: { reason: 'paid' },
    })
  })
})

describe('cancelling and refunding', () => {
  it('cancels an attempt that is processing, and refuses an extra field in the body', async () => {
    await start('approve')

    const extra = await post(`/${number}/payment/attempts/1/cancel`, {
      token,
      body: { status: 'cancelled' },
    })
    expect(extra.status).toBe(400)
    expect((await errorOf(extra)).message).toBe('The field "status" is not valid')

    const cancelled = await post(`/${number}/payment/attempts/1/cancel`, { token })
    expect(cancelled.status).toBe(200)
    expect((await orderOf(cancelled)).payment!.attempts[0]).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'visitor',
    })
    // The same request again, with an empty object this time.
    const again = await post(`/${number}/payment/attempts/1/cancel`, { token, body: {} })
    expect(again.status).toBe(200)
  })

  it.each(['0', '4', '10', 'x', '1.0', '-1'])(
    'does not know an attempt numbered %j',
    async (attempt) => {
      await start('approve')

      const response = await post(`/${number}/payment/attempts/${attempt}/cancel`, { token })
      expect(response.status).toBe(404)
      expect((await errorOf(response)).code).toBe('payment_attempt_not_found')
    },
  )

  it('refunds a paid order once, and refuses an order that is not paid', async () => {
    const early = await post(`/${number}/payment/refund`, { token })
    expect(await errorOf(early)).toMatchObject({
      code: 'refund_not_allowed',
      details: { state: 'awaiting' },
    })

    await start('approve')
    clock = START + 3_000
    const refunded = await post(`/${number}/payment/refund`, { token, body: {} })
    expect(refunded.status).toBe(200)
    expect((await orderOf(refunded)).payment!.state).toBe('refunded')
    expect((await post(`/${number}/payment/refund`, { token, body: { amount: 5 } })).status).toBe(
      400,
    )
  })
})

describe('the payment routes need the owner', () => {
  it.each([
    [
      'start',
      (auth?: string) =>
        post(`/${number}/payment/attempts`, {
          token: auth,
          key: 'pay-key-0000000000001',
          body: { scenario: 'approve' },
        }),
    ],
    ['cancel', (auth?: string) => post(`/${number}/payment/attempts/1/cancel`, { token: auth })],
    ['refund', (auth?: string) => post(`/${number}/payment/refund`, { token: auth })],
  ])(
    'refuses to %s without a session, and answers another account as for an order that does not exist',
    async (_name, send) => {
      expect((await send()).status).toBe(401)

      const someone = await account('someone')
      const response = await send(someone)
      expect(response.status).toBe(404)
      expect((await errorOf(response)).code).toBe('order_not_found')
      expect(orders.stored[0]!.payment!.attempts).toHaveLength(0)
    },
  )

  it('answers an address that is not an order number as not found', async () => {
    const response = await post('/not-an-order/payment/refund', { token })
    expect(response.status).toBe(404)
    expect((await errorOf(response)).code).toBe('order_not_found')
  })
})

describe('reading an order stores a decision that is due', () => {
  it('for GET and for HEAD alike, and a repeat changes nothing more', async () => {
    await start('approve')
    clock = START + 3_000

    const head = await fetch(`${api.url}/api/orders/${number}`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(head.status).toBe(200)
    expect(orders.stored[0]!.payment).toMatchObject({ state: 'paid', version: 2 })

    await fetch(`${api.url}/api/orders/${number}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(orders.stored[0]!.payment!.version).toBe(2)
  })
})

describe('the limit on payment actions', () => {
  it('is 30 an hour for one client, shared by starting, cancelling and refunding', async () => {
    build({ ...NO_ORDER_RATE_LIMITS, payment: { max: 3, windowMs: 60_000 } })

    await start('approve')
    await post(`/${number}/payment/attempts/1/cancel`, { token })
    await post(`/${number}/payment/refund`, { token })
    const refused = await start('approve', 'pay-key-0000000000002')

    expect(refused.status).toBe(429)
    expect((await errorOf(refused)).code).toBe('rate_limited')
    expect(refused.headers.get('retry-after')).not.toBeNull()
    expect(ORDER_RATE_LIMITS.payment).toEqual({ max: 30, windowMs: 60 * 60 * 1000 })
    expect(NO_ORDER_RATE_LIMITS.payment).toBeNull()
  })
})
