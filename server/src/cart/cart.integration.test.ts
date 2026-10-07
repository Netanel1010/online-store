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
import { CartConflictError, createCartRepository } from './repository.ts'
import type { PublicCart } from './types.ts'

// Optional: runs only when MONGODB_TEST_URI points at a real MongoDB (local or Atlas), for example
//   MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:integration
// Without it the tests are skipped, so ordinary runs and CI need no database. They work in a
// database of their own with a random name and drop it at the end; they never use MONGODB_URI and
// never touch the collections of any other database. The tests build on each other, in the order
// written. What they prove cannot be proven with a fake: that MongoDB's unique index and its atomic
// compare-and-swap are what keep a cart correct when changes arrive at the same moment.
const uri = process.env.MONGODB_TEST_URI

describe.skipIf(!uri)('carts on a real MongoDB (integration, needs MONGODB_TEST_URI)', () => {
  let database: Database
  let carts: ReturnType<typeof createCartRepository>
  let api: Awaited<ReturnType<typeof listen>>
  const rawCarts = () => database.db().collection('carts')
  const NOW = new Date('2026-01-01T10:00:00Z')
  const ITEMS = [
    { productId: 'A-1', quantity: 2 },
    { productId: 'B-2', quantity: 1 },
  ]

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

  const call = (method: string, path: string, token: string, body?: unknown) =>
    fetch(`${api.url}/api/cart${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

  beforeAll(async () => {
    const dbName = `online_store_test_${randomUUID().slice(0, 8)}`
    database = createDatabase({ uri: uri!, dbName, connectTimeoutMs: 10_000 })
    await database.connect()
    carts = createCartRepository(database)
    await carts.ensureIndexes()
    await createUserRepository(database).ensureIndexes()
    await createSessionRepository(database).ensureIndexes()
    // The products of this temporary database: only products that exist can be put in a cart.
    const products = createProductRepository(database)
    await products.ensureIndexes()
    await products.upsertMany([makeProduct({ id: 'GV-N4060' }), makeProduct({ id: 'PSU-1' })])
    api = await listen(createApp({ corsOrigins: [] }, undefined, database))
  })

  afterAll(async () => {
    await api.close()
    await database.db().dropDatabase()
    await database.close()
  })

  it('creates the unique index on the account, and creating it again changes nothing', async () => {
    await carts.ensureIndexes()
    await carts.ensureIndexes()

    const indexes = await rawCarts().listIndexes().toArray()
    expect(indexes.map((index) => index.name).sort()).toEqual(['_id_', 'userId_unique'])
    expect(indexes.find((index) => index.name === 'userId_unique')).toMatchObject({
      key: { userId: 1 },
      unique: true,
    })
  })

  it('stores a cart and reads it back exactly, with its date and without the internal _id', async () => {
    await carts.save('round-trip', ITEMS, null, NOW)

    const found = await carts.find('round-trip')

    expect(found).toEqual({ userId: 'round-trip', items: ITEMS, revision: 1, updatedAt: NOW })
    expect(found).not.toHaveProperty('_id')
    expect(found!.updatedAt).toBeInstanceOf(Date)
    expect(await carts.find('nobody')).toBeNull()
  })

  it('stores nothing but the account, the lines, the revision and the date', async () => {
    await carts.save(
      'shape',
      [{ productId: 'A-1', quantity: 2, name: 'Card', price: 9 } as never],
      null,
      NOW,
    )

    const raw = await rawCarts().findOne({ userId: 'shape' })

    expect(Object.keys(raw!).sort()).toEqual(['_id', 'items', 'revision', 'updatedAt', 'userId'])
    expect(raw!.items).toEqual([{ productId: 'A-1', quantity: 2 }])
  })

  it('counts every change and replaces the lines', async () => {
    await carts.save('counted', ITEMS, null, NOW)
    await carts.save('counted', [{ productId: 'A-1', quantity: 9 }], 1, NOW)
    await carts.save('counted', [], 2, NOW)

    expect(await carts.find('counted')).toMatchObject({ items: [], revision: 3 })
  })

  it('refuses a second cart for an account, and a change to a cart that has moved on', async () => {
    await carts.save('conflicts', ITEMS, null, NOW)

    await expect(carts.save('conflicts', ITEMS, null, NOW)).rejects.toBeInstanceOf(
      CartConflictError,
    )
    await carts.save('conflicts', [], 1, NOW)
    await expect(carts.save('conflicts', ITEMS, 1, NOW)).rejects.toBeInstanceOf(CartConflictError)
    await expect(carts.save('never-existed', ITEMS, 5, NOW)).rejects.toBeInstanceOf(
      CartConflictError,
    )

    expect(await carts.find('conflicts')).toMatchObject({ items: [], revision: 2 })
    expect(await rawCarts().countDocuments({ userId: 'conflicts' })).toBe(1)
    expect(await carts.find('never-existed')).toBeNull()
  })

  it('lets exactly one of ten simultaneous first writes through', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => carts.save('race-new', ITEMS, null, NOW)),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    for (const result of results.filter((entry) => entry.status === 'rejected')) {
      expect(result.reason).toBeInstanceOf(CartConflictError)
    }
    expect(await rawCarts().countDocuments({ userId: 'race-new' })).toBe(1)
  })

  it('lets exactly one of ten simultaneous changes at the same revision through', async () => {
    await carts.save('race-swap', ITEMS, null, NOW)

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        carts.save('race-swap', [{ productId: 'A-1', quantity: index + 1 }], 1, NOW),
      ),
    )

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect((await carts.find('race-swap'))!.revision).toBe(2)
  })

  it('removes the cart of an account and no other, and a removed cart can start again', async () => {
    await carts.save('gone', ITEMS, null, NOW)
    await carts.save('stays', ITEMS, null, NOW)

    await carts.delete('gone')
    await carts.delete('gone')

    expect(await carts.find('gone')).toBeNull()
    expect(await carts.find('stays')).not.toBeNull()
    await carts.save('gone', ITEMS, null, NOW)
    expect(await carts.find('gone')).toMatchObject({ revision: 1 })
  })

  it('treats an account that looks like a query as plain text', async () => {
    expect(await carts.find('{"$ne":""}')).toBeNull()
    await carts.delete('{"$ne":""}')
    expect(await rawCarts().countDocuments({ userId: 'stays' })).toBe(1)
  })

  it('finds a cart by its index, not by reading the collection', async () => {
    const plan = await rawCarts().find({ userId: 'stays' }).explain('queryPlanner')

    const text = JSON.stringify(plan.queryPlanner.winningPlan)
    expect(text).toContain('IXSCAN')
    expect(text).toContain('userId_unique')
  })

  it('makes the cart through the whole API: add, set, remove, read, empty', async () => {
    const { id, token } = await account()

    const added = (await (
      await call('POST', '/items', token, { productId: 'GV-N4060', quantity: 2 })
    ).json()) as PublicCart
    const set = (await (
      await call('PUT', '/items/PSU-1', token, { quantity: 3 })
    ).json()) as PublicCart
    const removed = (await (await call('DELETE', '/items/GV-N4060', token)).json()) as PublicCart
    const read = (await (await call('GET', '', token)).json()) as PublicCart

    expect(added.items).toEqual([{ productId: 'GV-N4060', quantity: 2 }])
    expect(set.items).toEqual([
      { productId: 'GV-N4060', quantity: 2 },
      { productId: 'PSU-1', quantity: 3 },
    ])
    expect(removed.items).toEqual([{ productId: 'PSU-1', quantity: 3 }])
    expect(read).toEqual(removed)
    expect(await rawCarts().countDocuments({ userId: id })).toBe(1)

    const emptied = await call('DELETE', '', token)
    expect(await emptied.json()).toEqual({ items: [], updatedAt: null })
    expect(await rawCarts().countDocuments({ userId: id })).toBe(0)
  })

  it('counts every one of four simultaneous adds, through the whole API', async () => {
    const { id, token } = await account()

    const responses = await Promise.all(
      Array.from({ length: 4 }, () => call('POST', '/items', token, { productId: 'GV-N4060' })),
    )

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200])
    expect(await carts.find(id)).toMatchObject({
      items: [{ productId: 'GV-N4060', quantity: 4 }],
      revision: 4,
    })
  })

  it('refuses a product that is not in the database, and a quantity that is not allowed, storing nothing', async () => {
    const { id, token } = await account()

    const missing = await call('POST', '/items', token, { productId: 'REMOVED-1' })
    const tooMany = await call('PUT', '/items/GV-N4060', token, { quantity: 100 })

    expect(missing.status).toBe(409)
    expect(
      ((await missing.json()) as { error: { code: string; details: unknown } }).error,
    ).toMatchObject({ code: 'product_unavailable', details: { productIds: ['REMOVED-1'] } })
    expect(tooMany.status).toBe(400)
    expect(await rawCarts().countDocuments({ userId: id })).toBe(0)
  })

  it('keeps two accounts apart through the whole API', async () => {
    const mine = await account()
    const theirs = await account()
    await call('POST', '/items', theirs.token, { productId: 'PSU-1', quantity: 5 })

    await call('DELETE', '/items/PSU-1', mine.token)
    await call('DELETE', '', mine.token)

    const read = (await (await call('GET', '', theirs.token)).json()) as PublicCart
    expect(read.items).toEqual([{ productId: 'PSU-1', quantity: 5 }])
  })
})
