import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/database.ts'
import { CartConflictError, createCartRepository } from './repository.ts'

// The driver's collection is replaced by recorded calls, so these tests check WHAT the repository
// asks MongoDB (the queries, the projection, the index, the writes). What MongoDB does with them is
// checked against a real server by the optional integration test.
const fake = vi.hoisted(() => {
  const collection = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    deleteOne: vi.fn(),
    createIndex: vi.fn(),
    // Never to be called: carts are changed one account at a time.
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    replaceOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    drop: vi.fn(),
  }
  return { collection, collectionOf: vi.fn<(name: string) => typeof collection>(() => collection) }
})

const database = {
  connect: vi.fn(),
  close: vi.fn(),
  ping: vi.fn(),
  db: vi.fn(() => ({ collection: fake.collectionOf })),
} as unknown as Database

const NOW = new Date('2026-01-01T10:00:00Z')
const ITEMS = [
  { productId: 'A-1', quantity: 2 },
  { productId: 'B-2', quantity: 1 },
]

beforeEach(() => {
  vi.clearAllMocks()
  fake.collection.findOne.mockResolvedValue(null)
  fake.collection.insertOne.mockResolvedValue({ acknowledged: true })
  fake.collection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
  fake.collection.deleteOne.mockResolvedValue({ deletedCount: 1 })
  fake.collection.createIndex.mockResolvedValue('index')
})

describe('the collection', () => {
  it('is "carts", looked up when used and not when the repository is created', async () => {
    const repository = createCartRepository(database)
    expect(database.db).not.toHaveBeenCalled()

    await repository.find('user-1')

    expect(fake.collectionOf).toHaveBeenCalledWith('carts')
  })
})

describe('ensureIndexes', () => {
  it('creates the unique index on the account, and only that one', async () => {
    await createCartRepository(database).ensureIndexes()

    expect(fake.collection.createIndex).toHaveBeenCalledTimes(1)
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { userId: 1 },
      { unique: true, name: 'userId_unique' },
    )
  })
})

describe('find', () => {
  it('looks up by the account, without the internal _id', async () => {
    const stored = { userId: 'user-1', items: ITEMS, revision: 3, updatedAt: NOW }
    fake.collection.findOne.mockResolvedValue(stored)

    const cart = await createCartRepository(database).find('user-1')

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { projection: { _id: 0 } },
    )
    expect(cart).toEqual(stored)
  })

  it('returns null for an account with no cart', async () => {
    expect(await createCartRepository(database).find('user-2')).toBeNull()
  })

  it('uses the account as a value, never as part of the query', async () => {
    const hostile = '{"$ne":""}'

    await createCartRepository(database).find(hostile)

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { userId: hostile },
      { projection: { _id: 0 } },
    )
  })

  it.each([
    ['no items', { userId: 'u', revision: 1, updatedAt: NOW }],
    [
      'a quantity of 0',
      { userId: 'u', items: [{ productId: 'A', quantity: 0 }], revision: 1, updatedAt: NOW },
    ],
    [
      'a quantity of 100',
      { userId: 'u', items: [{ productId: 'A', quantity: 100 }], revision: 1, updatedAt: NOW },
    ],
    [
      'a fractional quantity',
      { userId: 'u', items: [{ productId: 'A', quantity: 1.5 }], revision: 1, updatedAt: NOW },
    ],
    ['no revision', { userId: 'u', items: [], updatedAt: NOW }],
    ['a date that is text', { userId: 'u', items: [], revision: 1, updatedAt: 'yesterday' }],
  ])('refuses a stored document with %s', async (_name, document) => {
    fake.collection.findOne.mockResolvedValue(document)

    await expect(createCartRepository(database).find('u')).rejects.toThrow(
      'A stored cart does not match the cart schema',
    )
  })
})

describe('save: a cart that does not exist yet', () => {
  it('inserts it at revision 1, with the lines and nothing else', async () => {
    await createCartRepository(database).save('user-1', ITEMS, null, NOW)

    expect(fake.collection.insertOne).toHaveBeenCalledTimes(1)
    expect(fake.collection.insertOne).toHaveBeenCalledWith({
      userId: 'user-1',
      items: ITEMS,
      revision: 1,
      updatedAt: NOW,
    })
    expect(fake.collection.updateOne).not.toHaveBeenCalled()
  })

  it('stores only the product and the quantity of a line, whatever else the caller passes', async () => {
    const lines = [{ productId: 'A-1', quantity: 2, name: 'Card', price: 1500 }]

    await createCartRepository(database).save('user-1', lines, null, NOW)

    const [document] = fake.collection.insertOne.mock.calls[0]!
    expect(document.items).toEqual([{ productId: 'A-1', quantity: 2 }])
    expect(JSON.stringify(document)).not.toContain('Card')
  })

  it('says there was a conflict when the account got a cart in the meantime (the unique index)', async () => {
    fake.collection.insertOne.mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { userId: 1 } }),
    )

    await expect(
      createCartRepository(database).save('user-1', ITEMS, null, NOW),
    ).rejects.toBeInstanceOf(CartConflictError)
  })

  it.each([
    ['a duplicate on a field it does not know', { code: 11000, keyPattern: { other: 1 } }],
    ['a duplicate with no key pattern', { code: 11000 }],
    ['a timeout', { code: 50 }],
  ])('passes on %s as it is', async (_name, extra) => {
    const error = Object.assign(new Error('boom'), extra)
    fake.collection.insertOne.mockRejectedValue(error)

    await expect(createCartRepository(database).save('user-1', ITEMS, null, NOW)).rejects.toBe(
      error,
    )
  })
})

describe('save: a cart that exists', () => {
  it('replaces the lines only if the cart is still at the revision that was read, and counts the change', async () => {
    await createCartRepository(database).save('user-1', ITEMS, 4, NOW)

    expect(fake.collection.updateOne).toHaveBeenCalledTimes(1)
    expect(fake.collection.updateOne).toHaveBeenCalledWith(
      { userId: 'user-1', revision: 4 },
      { $set: { items: ITEMS, updatedAt: NOW }, $inc: { revision: 1 } },
    )
    expect(fake.collection.insertOne).not.toHaveBeenCalled()
  })

  it('says there was a conflict when no cart is at that revision any more', async () => {
    fake.collection.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 })

    await expect(
      createCartRepository(database).save('user-1', ITEMS, 4, NOW),
    ).rejects.toBeInstanceOf(CartConflictError)
  })

  it('passes on a failed write as it is', async () => {
    fake.collection.updateOne.mockRejectedValue(new Error('not primary'))

    await expect(createCartRepository(database).save('user-1', ITEMS, 4, NOW)).rejects.toThrow(
      'not primary',
    )
  })
})

describe('delete', () => {
  it('removes the cart of the account, and only that', async () => {
    await createCartRepository(database).delete('user-1')

    expect(fake.collection.deleteOne).toHaveBeenCalledTimes(1)
    expect(fake.collection.deleteOne).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(fake.collection.deleteMany).not.toHaveBeenCalled()
  })
})

describe('what the repository never does', () => {
  it('never changes or removes carts in bulk, replaces one or drops the collection', async () => {
    const repository = createCartRepository(database)
    await repository.ensureIndexes()
    await repository.find('user-1')
    await repository.save('user-1', ITEMS, null, NOW)
    await repository.save('user-1', ITEMS, 1, NOW)
    await repository.delete('user-1')

    for (const name of [
      'updateMany',
      'deleteMany',
      'replaceOne',
      'findOneAndUpdate',
      'drop',
    ] as const) {
      expect(fake.collection[name]).not.toHaveBeenCalled()
    }
  })
})
