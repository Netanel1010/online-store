import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/database.ts'
import { makeProduct } from '../testing/products.ts'
import { createProductRepository } from './repository.ts'

// The driver's collection is replaced by recorded calls, so these tests check WHAT the repository
// asks MongoDB (the queries, the order, the projection, the writes). What MongoDB does with them is
// checked against a real server by the optional integration test.
const fake = vi.hoisted(() => {
  const cursor = {
    sort: vi.fn(),
    skip: vi.fn(),
    limit: vi.fn(),
    toArray: vi.fn(),
  }
  const collection = {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
    createIndex: vi.fn(),
    bulkWrite: vi.fn(),
    // Never to be called: the repository does not delete.
    deleteOne: vi.fn(),
    deleteMany: vi.fn(),
    drop: vi.fn(),
  }
  return {
    cursor,
    collection,
    collectionOf: vi.fn<(name: string) => typeof collection>(() => collection),
  }
})

const database = {
  connect: vi.fn(),
  close: vi.fn(),
  ping: vi.fn(),
  db: vi.fn(() => ({ collection: fake.collectionOf })),
} as unknown as Database

const a = makeProduct({ id: 'A-1' })
const b = makeProduct({ id: 'B-2' })

beforeEach(() => {
  vi.clearAllMocks()
  fake.cursor.sort.mockReturnValue(fake.cursor)
  fake.cursor.skip.mockReturnValue(fake.cursor)
  fake.cursor.limit.mockReturnValue(fake.cursor)
  fake.cursor.toArray.mockResolvedValue([])
  fake.collection.find.mockReturnValue(fake.cursor)
  fake.collection.countDocuments.mockResolvedValue(0)
  fake.collection.findOne.mockResolvedValue(null)
})

describe('the collection', () => {
  it('is "products", looked up when used and not when the repository is created', async () => {
    const repository = createProductRepository(database)
    expect(database.db).not.toHaveBeenCalled()

    await repository.findById('A-1')

    expect(fake.collectionOf).toHaveBeenCalledWith('products')
  })
})

describe('ensureIndexes', () => {
  it('creates the unique index on id, and only that one', async () => {
    await createProductRepository(database).ensureIndexes()

    expect(fake.collection.createIndex).toHaveBeenCalledTimes(1)
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { id: 1 },
      { unique: true, name: 'id_unique' },
    )
  })

  it('can be called again: createIndex is what makes it a no-op when the index exists', async () => {
    const repository = createProductRepository(database)

    await repository.ensureIndexes()
    await repository.ensureIndexes()

    expect(fake.collection.createIndex).toHaveBeenCalledTimes(2)
    for (const call of fake.collection.createIndex.mock.calls) {
      expect(call).toEqual([{ id: 1 }, { unique: true, name: 'id_unique' }])
    }
  })

  it('passes on a failure, for example an existing duplicate that blocks the unique index', async () => {
    fake.collection.createIndex.mockRejectedValue(new Error('E11000 duplicate key'))

    await expect(createProductRepository(database).ensureIndexes()).rejects.toThrow('E11000')
  })
})

describe('list', () => {
  it('asks for one page, in the order of the unique id, without the internal _id', async () => {
    fake.cursor.toArray.mockResolvedValue([a, b])
    fake.collection.countDocuments.mockResolvedValue(31)

    const result = await createProductRepository(database).list({ skip: 20, limit: 10 })

    expect(fake.collection.find).toHaveBeenCalledWith({}, { projection: { _id: 0 } })
    expect(fake.cursor.sort).toHaveBeenCalledWith({ id: 1 })
    expect(fake.cursor.skip).toHaveBeenCalledWith(20)
    expect(fake.cursor.limit).toHaveBeenCalledWith(10)
    expect(result).toEqual({ items: [a, b], total: 31 })
  })

  it('counts once per call, with no filter', async () => {
    await createProductRepository(database).list({ skip: 0, limit: 20 })

    expect(fake.collection.countDocuments).toHaveBeenCalledTimes(1)
    expect(fake.collection.countDocuments).toHaveBeenCalledWith({})
    expect(fake.collection.find).toHaveBeenCalledTimes(1)
  })

  it('never returns the MongoDB _id, even if a document has one', async () => {
    fake.cursor.toArray.mockResolvedValue([{ _id: 'internal', ...a }])

    const { items } = await createProductRepository(database).list({ skip: 0, limit: 20 })

    expect(items[0]).toEqual(a)
    expect(items[0]).not.toHaveProperty('_id')
  })

  it('refuses a stored document that is not a valid product, and names it', async () => {
    fake.cursor.toArray.mockResolvedValue([a, { ...b, price: { current: -5 } }])

    const failure = await createProductRepository(database)
      .list({ skip: 0, limit: 20 })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      'The stored product "B-2" does not match the product schema',
    )
  })

  it('passes on a database failure as it is, for the central error handler', async () => {
    fake.cursor.toArray.mockRejectedValue(new Error('connection to db.example.com timed out'))

    await expect(createProductRepository(database).list({ skip: 0, limit: 20 })).rejects.toThrow(
      'timed out',
    )
  })

  it('fails when the database is not connected', async () => {
    vi.mocked(database.db).mockImplementationOnce(() => {
      throw new Error('The database is not connected: call connect() first')
    })

    await expect(createProductRepository(database).list({ skip: 0, limit: 20 })).rejects.toThrow(
      'not connected',
    )
  })
})

describe('findById', () => {
  it('looks up by the product id, not by _id, without the internal _id', async () => {
    fake.collection.findOne.mockResolvedValue(a)

    const product = await createProductRepository(database).findById('A-1')

    expect(fake.collection.findOne).toHaveBeenCalledWith({ id: 'A-1' }, { projection: { _id: 0 } })
    expect(product).toEqual(a)
  })

  it('returns null for a product that does not exist', async () => {
    expect(await createProductRepository(database).findById('NOPE')).toBeNull()
  })

  it('uses the id as a value, never as part of the query', async () => {
    const hostile = '{"$ne":""}'

    await createProductRepository(database).findById(hostile)

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { id: hostile },
      { projection: { _id: 0 } },
    )
  })

  it('refuses a stored document that is not a valid product', async () => {
    fake.collection.findOne.mockResolvedValue({ id: 'A-1' })

    await expect(createProductRepository(database).findById('A-1')).rejects.toThrow(
      'The stored product "A-1" does not match the product schema',
    )
  })

  it('passes on a database failure as it is', async () => {
    fake.collection.findOne.mockRejectedValue(new Error('not primary'))

    await expect(createProductRepository(database).findById('A-1')).rejects.toThrow('not primary')
  })
})

describe('upsertMany', () => {
  it('updates by product id with upsert, one operation per product, in one call', async () => {
    fake.collection.bulkWrite.mockResolvedValue({
      upsertedCount: 1,
      modifiedCount: 0,
      matchedCount: 1,
    })

    await createProductRepository(database).upsertMany([a, b])

    expect(fake.collection.bulkWrite).toHaveBeenCalledTimes(1)
    expect(fake.collection.bulkWrite).toHaveBeenCalledWith([
      { updateOne: { filter: { id: 'A-1' }, update: { $set: a }, upsert: true } },
      { updateOne: { filter: { id: 'B-2' }, update: { $set: b }, upsert: true } },
    ])
  })

  it('counts inserted, updated and unchanged products from the result', async () => {
    fake.collection.bulkWrite.mockResolvedValue({
      upsertedCount: 2,
      modifiedCount: 1,
      matchedCount: 4,
    })

    const result = await createProductRepository(database).upsertMany([a, b])

    expect(result).toEqual({ inserted: 2, updated: 1, unchanged: 3 })
  })

  it('never deletes anything', async () => {
    fake.collection.bulkWrite.mockResolvedValue({
      upsertedCount: 0,
      modifiedCount: 0,
      matchedCount: 2,
    })

    await createProductRepository(database).upsertMany([a, b])

    expect(fake.collection.deleteOne).not.toHaveBeenCalled()
    expect(fake.collection.deleteMany).not.toHaveBeenCalled()
    expect(fake.collection.drop).not.toHaveBeenCalled()
  })

  it('passes on a write failure as it is', async () => {
    fake.collection.bulkWrite.mockRejectedValue(new Error('E11000 duplicate key'))

    await expect(createProductRepository(database).upsertMany([a])).rejects.toThrow('E11000')
  })
})

describe('countNotIn', () => {
  it('counts the stored products whose id is not in the list', async () => {
    fake.collection.countDocuments.mockResolvedValue(3)

    const count = await createProductRepository(database).countNotIn(['A-1', 'B-2'])

    expect(fake.collection.countDocuments).toHaveBeenCalledWith({ id: { $nin: ['A-1', 'B-2'] } })
    expect(count).toBe(3)
  })
})
