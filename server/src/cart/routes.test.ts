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
import { createMemoryCartRepository } from '../testing/memoryCartRepository.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct } from '../testing/products.ts'
import { CART_RATE_LIMITS, createCartRouter, NO_CART_RATE_LIMITS } from './routes.ts'
import { createCartService } from './service.ts'
import type { PublicCart } from './types.ts'

const logger = { error: vi.fn() }
const card = makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 1500 } })
const psu = makeProduct({ id: 'PSU-1', name: 'Power supply', price: { current: 400 } })

let clock = Date.parse('2026-01-01T10:00:00Z')
let users = createMemoryUserRepository()
let sessions = createMemorySessionRepository()
let carts = createMemoryCartRepository()

// The real router, cart service, authentication middleware and error handling over in-memory
// repositories, behind a real HTTP server.
const router = { current: express.Router() }
function build(limits = NO_CART_RATE_LIMITS) {
  const auth = createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle(),
    now: () => new Date(clock),
  })
  router.current = createCartRouter(
    createCartService({
      carts: carts.repository,
      products: createMemoryProductRepository([card, psu]).repository,
      now: () => new Date(clock),
    }),
    createRequireAuth(auth),
    limits,
  )
}
const app = express()
app.use(express.json({ limit: '100kb' }))
app.use('/api/cart', (req, res, next) => router.current(req, res, next))
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
  carts = createMemoryCartRepository()
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

const send = (method: string, path: string, token?: string, body?: unknown, raw?: string) =>
  fetch(`${api.url}/api/cart${path}`, {
    method,
    headers: {
      ...(body === undefined && raw === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
const cartOf = async (response: Response) => (await response.json()) as PublicCart
const errorOf = async (response: Response) => ((await response.json()) as ErrorBody).error

describe('every cart route needs a signed-in visitor', () => {
  it.each([
    ['read the cart', () => send('GET', '')],
    ['add to the cart', () => send('POST', '/items', undefined, { productId: 'GV-N4060' })],
    ['set a quantity', () => send('PUT', '/items/GV-N4060', undefined, { quantity: 2 })],
    ['remove a line', () => send('DELETE', '/items/GV-N4060')],
    ['empty the cart', () => send('DELETE', '')],
  ])('refuses to %s without a token', async (_name, request) => {
    const response = await request()

    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toBe('Bearer')
    expect((await errorOf(response)).code).toBe('unauthorized')
    expect(carts.stored.size).toBe(0)
  })

  it.each([
    ['a token nobody has', 'x'.repeat(43)],
    ['something that is not a token', 'hello'],
  ])('refuses %s', async (_name, token) => {
    expect((await send('GET', '', token)).status).toBe(401)
    expect((await send('POST', '/items', token, { productId: 'GV-N4060' })).status).toBe(401)
    expect((await send('PUT', '/items/GV-N4060', token, { quantity: 1 })).status).toBe(401)
    expect((await send('DELETE', '/items/GV-N4060', token)).status).toBe(401)
    expect((await send('DELETE', '', token)).status).toBe(401)
    expect(carts.stored.size).toBe(0)
  })

  it('refuses a session that has ended', async () => {
    const { token } = await account('dana')
    clock += SESSION_TTL_MS + 1

    expect((await send('GET', '', token)).status).toBe(401)
    expect((await send('POST', '/items', token, { productId: 'GV-N4060' })).status).toBe(401)
  })

  it('checks the session before it reads the body', async () => {
    const response = await send('POST', '/items', undefined, { nonsense: true })

    expect(response.status).toBe(401)
  })
})

describe('GET /api/cart', () => {
  it('is an empty cart for an account that has never used it', async () => {
    const { token } = await account('netanel')

    const response = await send('GET', '', token)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    expect(await response.json()).toEqual({ items: [], updatedAt: null })
  })

  it('is never kept by a browser or a proxy', async () => {
    const { token } = await account('netanel')

    expect((await send('GET', '', token)).headers.get('cache-control')).toBe('no-store')
    expect((await send('GET', '')).headers.get('cache-control')).toBe('no-store')
  })
})

describe('adding, setting and removing', () => {
  it('adds a product, one unit unless said otherwise, and answers with the whole cart', async () => {
    const { token } = await account('netanel')

    const response = await send('POST', '/items', token, { productId: 'GV-N4060' })

    expect(response.status).toBe(200)
    expect(await cartOf(response)).toEqual({
      items: [{ productId: 'GV-N4060', quantity: 1 }],
      updatedAt: '2026-01-01T10:00:00.000Z',
    })
  })

  it('merges a second add into the line, and a read shows the same cart', async () => {
    const { token } = await account('netanel')
    await send('POST', '/items', token, { productId: 'GV-N4060', quantity: 2 })

    const added = await cartOf(
      await send('POST', '/items', token, { productId: 'GV-N4060', quantity: 3 }),
    )
    const read = await cartOf(await send('GET', '', token))

    expect(added.items).toEqual([{ productId: 'GV-N4060', quantity: 5 }])
    expect(read).toEqual(added)
  })

  it('sets a quantity with PUT, again and again with the same result', async () => {
    const { token } = await account('netanel')

    const first = await cartOf(await send('PUT', '/items/PSU-1', token, { quantity: 4 }))
    const second = await cartOf(await send('PUT', '/items/PSU-1', token, { quantity: 4 }))

    expect(first.items).toEqual([{ productId: 'PSU-1', quantity: 4 }])
    expect(second.items).toEqual(first.items)
  })

  it('removes a line with DELETE, and is quiet about a line that is not there', async () => {
    const { token } = await account('netanel')
    await send('POST', '/items', token, { productId: 'GV-N4060', quantity: 2 })
    await send('POST', '/items', token, { productId: 'PSU-1' })

    const removed = await send('DELETE', '/items/GV-N4060', token)
    const again = await send('DELETE', '/items/GV-N4060', token)

    expect(removed.status).toBe(200)
    expect((await cartOf(removed)).items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
    expect(again.status).toBe(200)
    expect((await cartOf(again)).items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
  })

  it('removes a line whose product is no longer in the catalog', async () => {
    const { id, token } = await account('netanel')
    await carts.repository.save(
      id,
      [{ productId: 'REMOVED-1', quantity: 2 }],
      null,
      new Date(clock),
    )

    const response = await send('DELETE', '/items/REMOVED-1', token)

    expect(response.status).toBe(200)
    expect((await cartOf(response)).items).toEqual([])
  })

  it('empties the cart with DELETE', async () => {
    const { token } = await account('netanel')
    await send('POST', '/items', token, { productId: 'GV-N4060', quantity: 2 })
    await send('POST', '/items', token, { productId: 'PSU-1' })

    const response = await send('DELETE', '', token)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], updatedAt: null })
    expect(await cartOf(await send('GET', '', token))).toEqual({ items: [], updatedAt: null })
  })

  it('stops at 99 units when adding', async () => {
    const { token } = await account('netanel')
    await send('POST', '/items', token, { productId: 'GV-N4060', quantity: 98 })

    const cart = await cartOf(
      await send('POST', '/items', token, { productId: 'GV-N4060', quantity: 50 }),
    )

    expect(cart.items).toEqual([{ productId: 'GV-N4060', quantity: 99 }])
  })

  it('keeps nothing but the product and the quantity', async () => {
    const { id, token } = await account('netanel')

    await send('POST', '/items', token, {
      productId: 'GV-N4060',
      quantity: 1,
      name: 'Free card',
      price: 1,
      userId: 'someone-else',
    })

    const document = carts.stored.get(id)!
    expect(document.items).toEqual([{ productId: 'GV-N4060', quantity: 1 }])
    expect(JSON.stringify(document)).not.toContain('Free card')
    expect(JSON.stringify(document)).not.toContain('RTX')
    expect(carts.stored.has('someone-else')).toBe(false)
  })
})

describe('what is refused', () => {
  it('answers 409 product_unavailable, naming the product, for a product that does not exist', async () => {
    const { token } = await account('netanel')

    const added = await send('POST', '/items', token, { productId: 'REMOVED-1' })
    const set = await send('PUT', '/items/REMOVED-1', token, { quantity: 2 })

    for (const response of [added, set]) {
      expect(response.status).toBe(409)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({
        error: {
          code: 'product_unavailable',
          message: 'Some of the products are not available',
          details: { productIds: ['REMOVED-1'] },
        },
      })
    }
    expect(carts.stored.size).toBe(0)
  })

  it.each([
    ['a quantity of 0', { productId: 'GV-N4060', quantity: 0 }],
    ['a quantity of 100', { productId: 'GV-N4060', quantity: 100 }],
    ['a fractional quantity', { productId: 'GV-N4060', quantity: 1.5 }],
    ['a quantity that is text', { productId: 'GV-N4060', quantity: '2' }],
    ['no product', { quantity: 1 }],
    ['a product id that is an object', { productId: { $ne: '' } }],
    ['a body that is a list', []],
  ])('refuses to add with %s: 400 invalid_input', async (_name, body) => {
    const { token } = await account('netanel')

    const response = await send('POST', '/items', token, body)

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_input')
    expect(carts.stored.size).toBe(0)
  })

  it.each([
    ['0', { quantity: 0 }],
    ['100', { quantity: 100 }],
    ['-1', { quantity: -1 }],
    ['no quantity', {}],
    ['a quantity that is text', { quantity: 'many' }],
  ])('refuses to set a quantity of %s: 400 invalid_input', async (_name, body) => {
    const { token } = await account('netanel')

    const response = await send('PUT', '/items/GV-N4060', token, body)

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_input')
    expect(carts.stored.size).toBe(0)
  })

  it.each(['A%20B', '%7B%22%24ne%22%3A%22%22%7D', 'A'.repeat(65)])(
    'refuses the product id %s in the address with 400 invalid_product_id',
    async (id) => {
      const { token } = await account('netanel')

      for (const response of [
        await send('PUT', `/items/${id}`, token, { quantity: 1 }),
        await send('DELETE', `/items/${id}`, token),
      ]) {
        expect(response.status).toBe(400)
        expect((await errorOf(response)).code).toBe('invalid_product_id')
      }
    },
  )

  it('does not echo what was sent when it refuses', async () => {
    const { token } = await account('netanel')

    const response = await send('POST', '/items', token, {
      productId: 'GV-N4060',
      quantity: 'SECRET',
    })

    expect(JSON.stringify(await response.json())).not.toContain('SECRET')
  })

  it('answers 400 invalid_json for a body that is not JSON', async () => {
    const { token } = await account('netanel')

    const response = await send('POST', '/items', token, undefined, '{not json')

    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('invalid_json')
  })

  it('answers 409 cart_full for a 51st product', async () => {
    const many = Array.from({ length: 51 }, (_, index) => makeProduct({ id: `P-${index}` }))
    const { id, token } = await account('netanel')
    router.current = createCartRouter(
      createCartService({
        carts: carts.repository,
        products: createMemoryProductRepository(many).repository,
      }),
      createRequireAuth(
        createAuthService({
          users: users.repository,
          sessions: sessions.repository,
          throttle: createLoginThrottle(),
          now: () => new Date(clock),
        }),
      ),
      NO_CART_RATE_LIMITS,
    )
    await carts.repository.save(
      id,
      many.slice(0, 50).map((product) => ({ productId: product.id, quantity: 1 })),
      null,
      new Date(clock),
    )

    const response = await send('POST', '/items', token, { productId: 'P-50' })

    expect(response.status).toBe(409)
    expect((await errorOf(response)).code).toBe('cart_full')
  })

  it('answers a database failure with a generic 500, and logs the real one', async () => {
    const { token } = await account('netanel')
    carts.repository.find = () => Promise.reject(new Error('not primary: secret-host'))

    const response = await send('GET', '', token)

    expect(response.status).toBe(500)
    const error = await errorOf(response)
    expect(error.code).toBe('internal_error')
    expect(JSON.stringify(error)).not.toContain('secret-host')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})

describe('a cart belongs to its account', () => {
  it('shows and changes only the cart of the session, whatever the request names', async () => {
    const mine = await account('netanel')
    const theirs = await account('dana')
    await send('POST', '/items', theirs.token, { productId: 'PSU-1', quantity: 5 })

    await send('POST', '/items', mine.token, { productId: 'GV-N4060', userId: theirs.id })
    await send('DELETE', '/items/PSU-1', mine.token) // not in my cart: theirs must stay
    const mineNow = await cartOf(await send('GET', '', mine.token))
    const theirsNow = await cartOf(await send('GET', '', theirs.token))

    expect(mineNow.items).toEqual([{ productId: 'GV-N4060', quantity: 1 }])
    expect(theirsNow.items).toEqual([{ productId: 'PSU-1', quantity: 5 }])
    expect(carts.stored.get(mine.id)!.userId).toBe(mine.id)
  })

  it('does not let one account empty the cart of another', async () => {
    const mine = await account('netanel')
    const theirs = await account('dana')
    await send('POST', '/items', theirs.token, { productId: 'PSU-1' })

    await send('DELETE', '', mine.token)

    expect((await cartOf(await send('GET', '', theirs.token))).items).toHaveLength(1)
  })
})

describe('the limit on changing the cart', () => {
  const LIMITED = { write: { max: 3, windowMs: 60_000 } }

  it('answers 429 rate_limited with Retry-After past the limit, and changes nothing for it', async () => {
    build(LIMITED)
    const { token } = await account('netanel')

    for (let index = 0; index < 3; index += 1) {
      expect((await send('POST', '/items', token, { productId: 'GV-N4060' })).status).toBe(200)
    }
    const refused = await send('POST', '/items', token, { productId: 'GV-N4060' })

    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/)
    expect((await errorOf(refused)).code).toBe('rate_limited')
    expect(carts.stored.get('id-netanel')!.items[0]!.quantity).toBe(3)
  })

  it('counts PUT and DELETE too, and stops a flood before it costs a lookup of a session', async () => {
    build(LIMITED)
    const lookups = vi.spyOn(sessions.repository, 'findByTokenHash')
    const stranger = 'x'.repeat(43)

    await send('PUT', '/items/GV-N4060', stranger, { quantity: 1 })
    await send('DELETE', '/items/GV-N4060', stranger)
    await send('DELETE', '', stranger)
    expect(lookups).toHaveBeenCalledTimes(3)
    const refused = await send('POST', '/items', stranger, { productId: 'GV-N4060' })

    expect(refused.status).toBe(429)
    expect(lookups).toHaveBeenCalledTimes(3)
  })

  it('does not limit reading the cart', async () => {
    build(LIMITED)
    const { token } = await account('netanel')

    const statuses = await Promise.all(
      Array.from({ length: 10 }, async () => (await send('GET', '', token)).status),
    )

    expect(new Set(statuses)).toEqual(new Set([200]))
  })

  it('is on by default, and generous for a person', () => {
    expect(CART_RATE_LIMITS.write).toEqual({ max: 300, windowMs: 15 * 60 * 1000 })
    expect(NO_CART_RATE_LIMITS.write).toBeNull()
  })
})

describe('the cart in the API', () => {
  it('answers 503 database_not_configured when the API runs without a database', async () => {
    const withoutDatabase = await listen(createApp({ corsOrigins: [] }, logger))
    try {
      const response = await fetch(`${withoutDatabase.url}/api/cart`)

      expect(response.status).toBe(503)
      expect((await errorOf(response)).code).toBe('database_not_configured')
    } finally {
      await withoutDatabase.close()
    }
  })
})
