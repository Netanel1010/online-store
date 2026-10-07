import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
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
import { ORDER_NUMBER_PATTERN } from './orderNumber.ts'
import { createOrdersRouter, NO_ORDER_RATE_LIMITS, ORDER_RATE_LIMITS } from './routes.ts'
import { createOrderService } from './service.ts'
import type { PublicOrder } from './types.ts'

const logger = { error: vi.fn() }
const KEY = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'
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
const card = makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 1500 } })
const sale = makeProduct({ id: 'SALE-1', name: 'On sale', price: { current: 800, original: 1000 } })
const body = (overrides: Record<string, unknown> = {}) => ({
  items: [{ productId: 'GV-N4060', quantity: 2 }],
  delivery: DELIVERY,
  ...overrides,
})

let clock = Date.parse('2026-01-01T10:00:00Z')
let users = createMemoryUserRepository()
let sessions = createMemorySessionRepository()
let orders = createMemoryOrderRepository()
let catalog = createMemoryProductRepository([card, sale])

// The real router, order service, authentication middleware and error handling over in-memory
// repositories, behind a real HTTP server.
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
      products: catalog.repository,
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

beforeEach(() => {
  clock = Date.parse('2026-01-01T10:00:00Z')
  users = createMemoryUserRepository()
  sessions = createMemorySessionRepository()
  orders = createMemoryOrderRepository()
  catalog = createMemoryProductRepository([card, sale])
  logger.error.mockClear()
  build()
})

/** An account with a live session, made directly: the sign-in has its own tests. */
async function account(name: string) {
  const token = generateToken()
  await users.repository.create({
    id: `id-${name}`,
    name,
    email: `${name}@example.com`,
    passwordHash: 'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
    createdAt: new Date(clock),
  })
  await sessions.repository.create({
    tokenHash: hashToken(token),
    userId: `id-${name}`,
    createdAt: new Date(clock),
    expiresAt: new Date(clock + SESSION_TTL_MS),
  })
  return { id: `id-${name}`, token }
}

const place = (
  token: string | undefined,
  payload: unknown = body(),
  key: string | null = KEY,
  raw?: string,
) =>
  fetch(`${api.url}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key === null ? {} : { 'Idempotency-Key': key }),
    },
    body: raw ?? JSON.stringify(payload),
  })
const get = (path: string, token?: string) =>
  fetch(`${api.url}/api/orders${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
const orderOf = async (response: Response) => (await response.json()) as PublicOrder
const errorOf = async (response: Response) => ((await response.json()) as ErrorBody).error

describe('every order route needs a signed-in visitor', () => {
  it.each([
    ['place an order', () => place(undefined)],
    ['list orders', () => get('')],
    ['read an order', () => get('/DEMO-7K2M9QX4')],
  ])('refuses to %s without a token', async (_name, send) => {
    const response = await send()

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect((await errorOf(response)).code).toBe('unauthorized')
  })

  it.each([
    ['a token nobody has', 'x'.repeat(43)],
    ['something that is not a token', 'hello'],
  ])('refuses %s', async (_name, token) => {
    expect((await place(token)).status).toBe(401)
    expect((await get('', token)).status).toBe(401)
    expect((await get('/DEMO-7K2M9QX4', token)).status).toBe(401)
  })

  it('refuses a session that has ended', async () => {
    const { token } = await account('dana')
    clock += SESSION_TTL_MS + 1

    expect((await place(token)).status).toBe(401)
    expect((await get('', token)).status).toBe(401)
  })

  it('stores nothing for a request that is not signed in', async () => {
    await place(undefined)
    await place('x'.repeat(43))

    expect(orders.stored).toHaveLength(0)
  })

  it('checks the session before it reads the body', async () => {
    const response = await place(undefined, { nonsense: true }, null)

    expect(response.status).toBe(401)
  })
})

describe('POST /api/orders', () => {
  it('places the order, answering 201 with the order, priced by the server', async () => {
    const { token } = await account('netanel')

    const response = await place(token, body({ expectedTotal: 3000 }))

    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    const order = await orderOf(response)
    expect(order).toEqual({
      orderNumber: expect.stringMatching(ORDER_NUMBER_PATTERN),
      createdAt: '2026-01-01T10:00:00.000Z',
      status: 'placed',
      lines: [{ productId: 'GV-N4060', name: 'RTX 4060', unitPrice: 1500, quantity: 2 }],
      total: 3000,
      originalTotal: 3000,
      savings: 0,
      delivery: DELIVERY,
    })
    expect(orders.stored).toHaveLength(1)
  })

  it('belongs to the account of the session, whatever the body says', async () => {
    const { id, token } = await account('netanel')

    await place(token, body({ userId: 'id-someone-else', user: { id: 'id-someone-else' } }))

    expect(orders.stored[0]!.userId).toBe(id)
  })

  it('ignores a price, a name or a total the client sends', async () => {
    const { token } = await account('netanel')

    const response = await place(
      token,
      body({
        total: 1,
        items: [{ productId: 'GV-N4060', quantity: 1, price: 1, unitPrice: 1, name: 'Free' }],
      }),
    )

    const order = await orderOf(response)
    expect(order.total).toBe(1500)
    expect(order.lines[0]).toMatchObject({ name: 'RTX 4060', unitPrice: 1500 })
  })

  it('answers 200 with the same order to the same request sent again, and makes no second order', async () => {
    const { token } = await account('netanel')

    const first = await place(token)
    const second = await place(token)

    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(await orderOf(second)).toEqual(await orderOf(first))
    expect(orders.stored).toHaveLength(1)
  })

  it('makes one order when the same request arrives six times at once', async () => {
    const { token } = await account('netanel')

    const responses = await Promise.all(Array.from({ length: 6 }, () => place(token)))

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 200, 200, 200, 200, 201,
    ])
    const numbers = new Set((await Promise.all(responses.map(orderOf))).map((o) => o.orderNumber))
    expect(numbers.size).toBe(1)
    expect(orders.stored).toHaveLength(1)
  })

  it('answers 409 idempotency_key_reuse when the key is used for something else', async () => {
    const { token } = await account('netanel')
    await place(token)

    const response = await place(token, body({ items: [{ productId: 'SALE-1', quantity: 1 }] }))

    expect(response.status).toBe(409)
    expect((await errorOf(response)).code).toBe('idempotency_key_reuse')
    expect(orders.stored).toHaveLength(1)
  })

  it('does not share a key between accounts', async () => {
    const mine = await account('netanel')
    const theirs = await account('dana')

    const first = await place(mine.token)
    const second = await place(theirs.token)

    expect([first.status, second.status]).toEqual([201, 201])
    expect(orders.stored).toHaveLength(2)
  })

  it('answers 409 product_unavailable with the products, and stores nothing', async () => {
    const { token } = await account('netanel')

    const response = await place(
      token,
      body({
        items: [
          { productId: 'GV-N4060', quantity: 1 },
          { productId: 'REMOVED-1', quantity: 1 },
        ],
      }),
    )

    expect(response.status).toBe(409)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      error: {
        code: 'product_unavailable',
        message: 'Some of the products are not available',
        details: { productIds: ['REMOVED-1'] },
      },
    })
    expect(orders.stored).toHaveLength(0)
  })

  it('answers 409 price_changed with both totals, and stores nothing', async () => {
    const { token } = await account('netanel')

    const response = await place(token, body({ expectedTotal: 2000 }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'price_changed',
        message: 'The total is not what you were shown',
        details: { expectedTotal: 2000, total: 3000 },
      },
    })
    expect(orders.stored).toHaveLength(0)
  })

  it('needs an Idempotency-Key', async () => {
    const { token } = await account('netanel')

    const response = await place(token, body(), null)

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('idempotency_key_required')
    expect(orders.stored).toHaveLength(0)
  })

  it.each(['short', 'has spaces in the middle 1234', 'x'.repeat(200)])(
    'refuses the Idempotency-Key %j',
    async (key) => {
      const { token } = await account('netanel')

      const response = await place(token, body(), key)

      expect(response.status).toBe(400)
      expect((await errorOf(response)).code).toBe('invalid_idempotency_key')
    },
  )

  it.each([
    ['an empty list of items', body({ items: [] })],
    ['a quantity of 100', body({ items: [{ productId: 'GV-N4060', quantity: 100 }] })],
    [
      'a product twice',
      body({
        items: [
          { productId: 'A', quantity: 1 },
          { productId: 'A', quantity: 1 },
        ],
      }),
    ],
    ['a bad phone number', body({ delivery: { ...DELIVERY, phone: 'abc' } })],
    ['no delivery details', { items: [{ productId: 'GV-N4060', quantity: 1 }] }],
    ['a body that is a list', []],
  ])('refuses %s with 400 invalid_input', async (_name, payload) => {
    const { token } = await account('netanel')

    const response = await place(token, payload)

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_input')
    expect(orders.stored).toHaveLength(0)
  })

  it('does not echo what was sent when it refuses', async () => {
    const { token } = await account('netanel')

    const response = await place(token, body({ delivery: { ...DELIVERY, phone: 'SECRET-PHONE' } }))

    expect(JSON.stringify(await response.json())).not.toContain('SECRET-PHONE')
  })

  it('answers 400 invalid_json for a body that is not JSON', async () => {
    const { token } = await account('netanel')

    const response = await place(token, undefined, KEY, '{not json')

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_json')
  })

  it('is never kept by a browser or a proxy', async () => {
    const { token } = await account('netanel')

    expect((await place(token)).headers.get('cache-control')).toBe('no-store')
    expect((await place(undefined)).headers.get('cache-control')).toBe('no-store')
  })

  it('answers a database failure with a generic 500 that names no order, and logs the real one', async () => {
    const { token } = await account('netanel')
    orders.repository.create = () => Promise.reject(new Error('not primary: 050-1234567'))

    const response = await place(token)

    expect(response.status).toBe(500)
    const error = await errorOf(response)
    expect(error.code).toBe('internal_error')
    expect(JSON.stringify(error)).not.toContain('050-1234567')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/orders/:orderNumber', () => {
  it('returns the order of the account', async () => {
    const { token } = await account('netanel')
    const placed = await orderOf(await place(token))

    const response = await get(`/${placed.orderNumber}`, token)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await orderOf(response)).toEqual(placed)
  })

  it('answers 404 order_not_found for the order of another account, like for one that does not exist', async () => {
    const mine = await account('netanel')
    const theirs = await account('dana')
    const placed = await orderOf(await place(mine.token))

    const other = await get(`/${placed.orderNumber}`, theirs.token)
    const unknown = await get('/DEMO-ZZZZZZZZ', theirs.token)

    expect(other.status).toBe(404)
    expect(unknown.status).toBe(404)
    expect(await other.json()).toEqual(await unknown.json())
  })

  it.each(['demo-7k2m9qx4', 'DEMO-1', '..%2F..%2Fetc', '%7B%22%24ne%22%3A%22%22%7D'])(
    'answers 404 order_not_found, not 400, for %s',
    async (path) => {
      const { token } = await account('netanel')

      const response = await get(`/${path}`, token)

      expect(response.status).toBe(404)
      expect((await errorOf(response)).code).toBe('order_not_found')
    },
  )

  it('shows the price the order had, not the price the product has now', async () => {
    const { token } = await account('netanel')
    const placed = await orderOf(await place(token))
    await catalog.repository.upsertMany([makeProduct({ id: 'GV-N4060', price: { current: 5000 } })])

    const again = await orderOf(await get(`/${placed.orderNumber}`, token))

    expect(again.total).toBe(3000)
    expect(again.lines[0]!.unitPrice).toBe(1500)
  })
})

describe('GET /api/orders', () => {
  async function placeAt(token: string, minutes: number, key: string) {
    clock = Date.UTC(2026, 0, 1, 10, minutes)
    return orderOf(await place(token, body(), key))
  }

  it('lists the newest first, in the same page shape as the products', async () => {
    const { token } = await account('netanel')
    const oldest = await placeAt(token, 0, 'key-aaaaaaaaaaaaaaaa')
    const newest = await placeAt(token, 9, 'key-bbbbbbbbbbbbbbbb')

    const response = await get('', token)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const page = (await response.json()) as { items: PublicOrder[] }
    expect(page).toEqual({
      items: [newest, oldest],
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    })
  })

  it('lists only the orders of the account', async () => {
    const mine = await account('netanel')
    const theirs = await account('dana')
    await placeAt(mine.token, 0, 'key-aaaaaaaaaaaaaaaa')
    await placeAt(theirs.token, 1, 'key-bbbbbbbbbbbbbbbb')

    const page = (await (await get('', mine.token)).json()) as {
      items: PublicOrder[]
      total: number
    }

    expect(page.total).toBe(1)
    expect(page.items).toHaveLength(1)
  })

  it('pages with page and limit', async () => {
    const { token } = await account('netanel')
    for (let minute = 0; minute < 3; minute += 1) {
      await placeAt(token, minute, `key-${minute}`.padEnd(16, 'x'))
    }

    const page = (await (await get('?page=2&limit=2', token)).json()) as {
      items: unknown[]
      page: number
      totalPages: number
    }

    expect(page).toMatchObject({ page: 2, totalPages: 2 })
    expect(page.items).toHaveLength(1)
  })

  it.each(['?page=0', '?limit=0', '?limit=101', '?page=abc', '?limit=1.5', '?page=-1'])(
    'refuses %s with 400 invalid_pagination',
    async (query) => {
      const { token } = await account('netanel')

      const response = await get(query, token)

      expect(response.status).toBe(400)
      expect((await errorOf(response)).code).toBe('invalid_pagination')
    },
  )

  it('has an empty page for an account with no orders', async () => {
    const { token } = await account('netanel')

    expect(await (await get('', token)).json()).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    })
  })
})

describe('the limit on placing orders', () => {
  const LIMITED = { place: { max: 2, windowMs: 60_000 } }

  it('answers 429 rate_limited with Retry-After past the limit, and makes no order for it', async () => {
    build(LIMITED)
    const { token } = await account('netanel')

    const statuses = [
      (await place(token, body(), 'key-aaaaaaaaaaaaaaaa')).status,
      (await place(token, body(), 'key-bbbbbbbbbbbbbbbb')).status,
    ]
    const refused = await place(token, body(), 'key-cccccccccccccccc')

    expect(statuses).toEqual([201, 201])
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/)
    expect((await errorOf(refused)).code).toBe('rate_limited')
    expect(orders.stored).toHaveLength(2)
  })

  it('counts a retry too, and a request that is refused', async () => {
    build(LIMITED)
    const { token } = await account('netanel')

    await place(token) // 201
    await place(token) // 200, the same order again
    const third = await place(token)

    expect(third.status).toBe(429)
  })

  it('stops a flood of requests before it costs a lookup of a session', async () => {
    build(LIMITED)
    const lookups = vi.spyOn(sessions.repository, 'findByTokenHash')
    const stranger = 'x'.repeat(43)

    await place(stranger)
    await place(stranger)
    expect(lookups).toHaveBeenCalledTimes(2)
    const refused = await place(stranger)

    expect(refused.status).toBe(429)
    expect(lookups).toHaveBeenCalledTimes(2)
  })

  it('does not limit reading orders', async () => {
    build(LIMITED)
    const { token } = await account('netanel')
    await place(token)

    const statuses = await Promise.all(
      Array.from({ length: 10 }, async () => (await get('', token)).status),
    )

    expect(new Set(statuses)).toEqual(new Set([200]))
  })

  it('is on by default, and generous for a person', () => {
    expect(ORDER_RATE_LIMITS.place).toEqual({ max: 20, windowMs: 60 * 60 * 1000 })
    expect(NO_ORDER_RATE_LIMITS.place).toBeNull()
  })
})

describe('the orders in the API', () => {
  it('answers 503 database_not_configured when the API runs without a database', async () => {
    const withoutDatabase = await listen(createApp({ corsOrigins: [] }, logger))
    try {
      const response = await fetch(`${withoutDatabase.url}/api/orders`)

      expect(response.status).toBe(503)
      expect((await errorOf(response)).code).toBe('database_not_configured')
    } finally {
      await withoutDatabase.close()
    }
  })
})
