import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createSessionRepository } from '../auth/sessionRepository.ts'
import { generateToken, hashToken } from '../auth/tokens.ts'
import { createUserRepository } from '../auth/userRepository.ts'
import { createDatabase, type Database } from '../db/database.ts'
import { createProductRepository } from '../products/repository.ts'
import { listen } from '../testing/listen.ts'
import { makeProduct } from '../testing/products.ts'
import {
  createOrderRepository,
  DuplicateIdempotencyKeyError,
  DuplicateOrderNumberError,
} from './repository.ts'
import { createOrderService } from './service.ts'
import type { Order, PublicOrder } from './types.ts'

// Optional: runs only when MONGODB_TEST_URI points at a real MongoDB (local or Atlas), for example
//   MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:integration
// Without it the tests are skipped, so ordinary runs and CI need no database. They work in a
// database of their own with a random name and drop it at the end; they never use MONGODB_URI and
// never touch the collections of any other database. The tests build on each other, in the order
// written. What they prove cannot be proven with a fake: that MongoDB's unique indexes are what
// keeps an order unique, even when the same request arrives many times at the same moment.
const uri = process.env.MONGODB_TEST_URI

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

describe.skipIf(!uri)('orders on a real MongoDB (integration, needs MONGODB_TEST_URI)', () => {
  let database: Database
  let orders: ReturnType<typeof createOrderRepository>
  let api: Awaited<ReturnType<typeof listen>>
  const rawOrders = () => database.db().collection('orders')

  const stored = (overrides: Partial<Order> = {}): Order => ({
    orderNumber: `DEMO-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    userId: 'user-1',
    idempotencyKey: randomUUID(),
    requestHash: 'a'.repeat(64),
    createdAt: new Date('2026-01-01T10:00:00Z'),
    status: 'placed',
    lines: [
      { productId: 'A-1', name: 'A', unitPrice: 800, originalUnitPrice: 1000, quantity: 2 },
      { productId: 'B-2', name: 'B', unitPrice: 500, quantity: 1 },
    ],
    total: 2100,
    originalTotal: 2500,
    savings: 400,
    delivery: DELIVERY,
    ...overrides,
  })

  /** An account with a live session, in the real collections. */
  async function account() {
    const id = randomUUID()
    const token = generateToken()
    const now = new Date()
    await createUserRepository(database).create({
      id,
      name: 'נתנאל',
      email: `user-${id.slice(0, 8)}@example.com`,
      passwordHash: 'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
      createdAt: now,
    })
    await createSessionRepository(database).create({
      tokenHash: hashToken(token),
      userId: id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    })
    return { id, token }
  }

  const place = (token: string, key: string, items = [{ productId: 'GV-N4060', quantity: 2 }]) =>
    fetch(`${api.url}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ items, delivery: DELIVERY }),
    })

  beforeAll(async () => {
    const dbName = `online_store_test_${randomUUID().slice(0, 8)}`
    database = createDatabase({ uri: uri!, dbName, connectTimeoutMs: 10_000 })
    await database.connect()
    orders = createOrderRepository(database)
    await orders.ensureIndexes()
    await createUserRepository(database).ensureIndexes()
    await createSessionRepository(database).ensureIndexes()
    // The products of this temporary database: the orders are priced from them.
    const products = createProductRepository(database)
    await products.ensureIndexes()
    await products.upsertMany([
      makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 1500 } }),
      makeProduct({ id: 'SALE-1', name: 'On sale', price: { current: 800, original: 1000 } }),
    ])
    api = await listen(createApp({ corsOrigins: [] }, undefined, database))
  })

  afterAll(async () => {
    await api.close()
    await database.db().dropDatabase()
    await database.close()
  })

  it('creates the three indexes, and creating them again changes nothing', async () => {
    await orders.ensureIndexes()
    await orders.ensureIndexes()

    const indexes = await rawOrders().listIndexes().toArray()
    expect(indexes.map((index) => index.name).sort()).toEqual([
      '_id_',
      'orderNumber_unique',
      'userId_createdAt_id',
      'userId_idempotencyKey_unique',
    ])
    expect(indexes.find((index) => index.name === 'orderNumber_unique')).toMatchObject({
      key: { orderNumber: 1 },
      unique: true,
    })
    expect(indexes.find((index) => index.name === 'userId_idempotencyKey_unique')).toMatchObject({
      key: { userId: 1, idempotencyKey: 1 },
      unique: true,
    })
    const listing = indexes.find((index) => index.name === 'userId_createdAt_id')
    expect(listing).toMatchObject({ key: { userId: 1, createdAt: -1, _id: -1 } })
    expect(listing?.unique).toBeUndefined()
  })

  it('stores an order and reads it back exactly, with its dates and without the internal _id', async () => {
    const order = stored({ userId: 'round-trip' })

    await orders.create(order)
    const found = await orders.findByOrderNumber('round-trip', order.orderNumber)

    expect(found).toEqual(order)
    expect(found).not.toHaveProperty('_id')
    expect(found!.createdAt).toBeInstanceOf(Date)
    // A line without a sale has no original price at all: MongoDB would store an undefined as null.
    const raw = await rawOrders().findOne({ orderNumber: order.orderNumber })
    expect(raw!.lines[1]).not.toHaveProperty('originalUnitPrice')
  })

  it('never finds the order of another account', async () => {
    const order = stored({ userId: 'owner' })
    await orders.create(order)

    expect(await orders.findByOrderNumber('owner', order.orderNumber)).not.toBeNull()
    expect(await orders.findByOrderNumber('stranger', order.orderNumber)).toBeNull()
    expect(await orders.findByIdempotencyKey('owner', order.idempotencyKey)).not.toBeNull()
    expect(await orders.findByIdempotencyKey('stranger', order.idempotencyKey)).toBeNull()
  })

  it('uses the value of an id as a value: an operator in it finds nothing', async () => {
    const order = stored({ userId: 'operators' })
    await orders.create(order)

    expect(await orders.findByOrderNumber('operators', '{"$ne":""}')).toBeNull()
    expect(await orders.findByIdempotencyKey('{"$ne":""}', order.idempotencyKey)).toBeNull()
  })

  it('refuses a second order with the same order number, whoever makes it', async () => {
    const first = stored({ userId: 'taken-1' })
    await orders.create(first)

    await expect(
      orders.create(stored({ userId: 'taken-1', orderNumber: first.orderNumber })),
    ).rejects.toBeInstanceOf(DuplicateOrderNumberError)
    await expect(
      orders.create(stored({ userId: 'taken-2', orderNumber: first.orderNumber })),
    ).rejects.toBeInstanceOf(DuplicateOrderNumberError)
  })

  it('refuses a second order with the same idempotency key for the same account only', async () => {
    const first = stored({ userId: 'key-1' })
    await orders.create(first)

    await expect(
      orders.create(stored({ userId: 'key-1', idempotencyKey: first.idempotencyKey })),
    ).rejects.toBeInstanceOf(DuplicateIdempotencyKeyError)
    await expect(
      orders.create(stored({ userId: 'key-2', idempotencyKey: first.idempotencyKey })),
    ).resolves.toBeUndefined()
  })

  it('lets exactly one of ten simultaneous creations with the same key through', async () => {
    const key = randomUUID()

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        orders.create(stored({ userId: 'race-repo', idempotencyKey: key })),
      ),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const refused = results.filter((result) => result.status === 'rejected')
    expect(refused).toHaveLength(9)
    for (const result of refused) {
      expect(result.reason).toBeInstanceOf(DuplicateIdempotencyKeyError)
    }
    expect(await rawOrders().countDocuments({ userId: 'race-repo', idempotencyKey: key })).toBe(1)
  })

  it('makes one order, through the whole API, when the same request arrives eight times at once', async () => {
    const { id, token } = await account()
    const key = randomUUID()

    const responses = await Promise.all(Array.from({ length: 8 }, () => place(token, key)))

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 200, 200, 200, 200, 200, 200, 201,
    ])
    const bodies = (await Promise.all(
      responses.map((response) => response.json()),
    )) as PublicOrder[]
    expect(new Set(bodies.map((order) => order.orderNumber)).size).toBe(1)
    expect(new Set(bodies.map((order) => JSON.stringify(order))).size).toBe(1)
    expect(await rawOrders().countDocuments({ userId: id })).toBe(1)
  })

  it('prices the order from the products in the database, and freezes it', async () => {
    const { token } = await account()

    const response = await place(token, randomUUID(), [
      { productId: 'GV-N4060', quantity: 2 },
      { productId: 'SALE-1', quantity: 1 },
    ])

    expect(response.status).toBe(201)
    const order = (await response.json()) as PublicOrder
    expect(order).toMatchObject({ total: 3800, originalTotal: 4000, savings: 200 })
    await createProductRepository(database).upsertMany([
      makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 9999 } }),
    ])
    const again = await fetch(`${api.url}/api/orders/${order.orderNumber}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect((await again.json()) as PublicOrder).toEqual(order)
    // Put it back for the tests that follow.
    await createProductRepository(database).upsertMany([
      makeProduct({ id: 'GV-N4060', name: 'RTX 4060', price: { current: 1500 } }),
    ])
  })

  it('refuses a product that is not in the database, and a wrong expected total, storing nothing', async () => {
    const { id, token } = await account()

    const missing = await place(token, randomUUID(), [{ productId: 'REMOVED-1', quantity: 1 }])
    const changed = await fetch(`${api.url}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify({
        items: [{ productId: 'GV-N4060', quantity: 1 }],
        delivery: DELIVERY,
        expectedTotal: 1,
      }),
    })

    expect(missing.status).toBe(409)
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      'product_unavailable',
    )
    expect(changed.status).toBe(409)
    expect(((await changed.json()) as { error: { details: unknown } }).error.details).toEqual({
      expectedTotal: 1,
      total: 1500,
    })
    expect(await rawOrders().countDocuments({ userId: id })).toBe(0)
  })

  it('draws a new order number when the one drawn is taken, with the real unique index', async () => {
    const { id } = await account()
    const taken = stored({ userId: 'someone-else' })
    await orders.create(taken)
    const draws = [taken.orderNumber, taken.orderNumber, 'DEMO-FRESH000']
    const service = createOrderService({
      orders,
      products: createProductRepository(database),
      generateOrderNumber: () => draws.shift() ?? 'DEMO-FRESH999',
    })

    const { order, created } = await service.place(
      id,
      { items: [{ productId: 'GV-N4060', quantity: 1 }], delivery: DELIVERY },
      randomUUID(),
    )

    expect(created).toBe(true)
    expect(order.orderNumber).toBe('DEMO-FRESH000')
    expect(await rawOrders().countDocuments({ orderNumber: taken.orderNumber })).toBe(1)
  })

  it("shows an account only its own orders over HTTP: another account's order is a 404", async () => {
    const mine = await account()
    const theirs = await account()
    const placed = (await (await place(mine.token, randomUUID())).json()) as PublicOrder

    const own = await fetch(`${api.url}/api/orders/${placed.orderNumber}`, {
      headers: { Authorization: `Bearer ${mine.token}` },
    })
    const other = await fetch(`${api.url}/api/orders/${placed.orderNumber}`, {
      headers: { Authorization: `Bearer ${theirs.token}` },
    })

    expect(own.status).toBe(200)
    expect(other.status).toBe(404)
    const list = (await (
      await fetch(`${api.url}/api/orders`, { headers: { Authorization: `Bearer ${theirs.token}` } })
    ).json()) as { total: number }
    expect(list.total).toBe(0)
  })

  describe("the list of an account's orders", () => {
    const user = 'listing'
    const numbers: string[] = []

    beforeAll(async () => {
      // Seven orders: two pairs made in the very same millisecond, to prove the order is complete.
      const times = [0, 1, 1, 2, 3, 3, 4]
      for (const [index, minute] of times.entries()) {
        const order = stored({
          userId: user,
          createdAt: new Date(Date.UTC(2026, 0, 1, 10, minute)),
          orderNumber: `DEMO-LIST000${index}`,
        })
        await orders.create(order)
        numbers.push(order.orderNumber)
      }
      await orders.create(stored({ userId: 'not-listing' }))
    })

    it('is the newest first, and the last made first among orders made at the same moment', async () => {
      const { items, total } = await orders.listForUser(user, { skip: 0, limit: 20 })

      expect(total).toBe(7)
      expect(items.map((order) => order.orderNumber)).toEqual([
        'DEMO-LIST0006',
        'DEMO-LIST0005',
        'DEMO-LIST0004',
        'DEMO-LIST0003',
        'DEMO-LIST0002',
        'DEMO-LIST0001',
        'DEMO-LIST0000',
      ])
    })

    it('pages without repeating or skipping an order', async () => {
      const seen: string[] = []
      for (let skip = 0; skip < 7; skip += 3) {
        const { items } = await orders.listForUser(user, { skip, limit: 3 })
        seen.push(...items.map((order) => order.orderNumber))
      }

      expect(seen).toHaveLength(7)
      expect(new Set(seen).size).toBe(7)
      expect(await orders.listForUser(user, { skip: 7, limit: 3 })).toMatchObject({
        items: [],
        total: 7,
      })
    })

    it('is served by the index made for it, not by sorting the collection', async () => {
      const plan = await rawOrders()
        .find({ userId: user })
        .sort({ createdAt: -1, _id: -1 })
        .limit(3)
        .explain('queryPlanner')

      const text = JSON.stringify(plan.queryPlanner.winningPlan)
      expect(text).toContain('IXSCAN')
      expect(text).toContain('userId_createdAt_id')
      expect(text).not.toContain('"SORT"')
    })
  })
})
