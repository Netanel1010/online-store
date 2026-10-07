import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/database.ts'
import { makeProduct } from '../testing/products.ts'
import { createProductRepository } from './repository.ts'
import { buildSearchFields, SEARCH_VERSION } from './searchFields.ts'
import type { ProductFilter } from './types.ts'

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
    aggregate: vi.fn(),
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

/** A filter with nothing selected. */
const plain: ProductFilter = { brands: [], specs: new Map() }

const a = makeProduct({ id: 'A-1' })
const b = makeProduct({ id: 'B-2' })

beforeEach(() => {
  vi.clearAllMocks()
  fake.cursor.sort.mockReturnValue(fake.cursor)
  fake.cursor.skip.mockReturnValue(fake.cursor)
  fake.cursor.limit.mockReturnValue(fake.cursor)
  fake.cursor.toArray.mockResolvedValue([])
  fake.collection.aggregate.mockReturnValue(fake.cursor)
  fake.collection.bulkWrite.mockResolvedValue({
    upsertedCount: 0,
    modifiedCount: 0,
    matchedCount: 0,
  })
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

    const result = await createProductRepository(database).list(plain, {
      sort: 'default',
      skip: 20,
      limit: 10,
    })

    expect(fake.collection.find).toHaveBeenCalledWith({}, { projection: { _id: 0, search: 0 } })
    expect(fake.cursor.sort).toHaveBeenCalledWith({ id: 1 })
    expect(fake.cursor.skip).toHaveBeenCalledWith(20)
    expect(fake.cursor.limit).toHaveBeenCalledWith(10)
    expect(result).toEqual({ items: [a, b], total: 31 })
  })

  it('counts once per call, with no filter', async () => {
    await createProductRepository(database).list(plain, { sort: 'default', skip: 0, limit: 20 })

    expect(fake.collection.countDocuments).toHaveBeenCalledTimes(1)
    expect(fake.collection.countDocuments).toHaveBeenCalledWith({})
    expect(fake.collection.find).toHaveBeenCalledTimes(1)
  })

  it('never returns the MongoDB _id, even if a document has one', async () => {
    fake.cursor.toArray.mockResolvedValue([{ _id: 'internal', ...a }])

    const { items } = await createProductRepository(database).list(plain, {
      sort: 'default',
      skip: 0,
      limit: 20,
    })

    expect(items[0]).toEqual(a)
    expect(items[0]).not.toHaveProperty('_id')
  })

  it('refuses a stored document that is not a valid product, and names it', async () => {
    fake.cursor.toArray.mockResolvedValue([a, { ...b, price: { current: -5 } }])

    const failure = await createProductRepository(database)
      .list(plain, { sort: 'default', skip: 0, limit: 20 })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe(
      'The stored product "B-2" does not match the product schema',
    )
  })

  it('passes on a database failure as it is, for the central error handler', async () => {
    fake.cursor.toArray.mockRejectedValue(new Error('connection to db.example.com timed out'))

    await expect(
      createProductRepository(database).list(plain, { sort: 'default', skip: 0, limit: 20 }),
    ).rejects.toThrow('timed out')
  })

  it('fails when the database is not connected', async () => {
    vi.mocked(database.db).mockImplementationOnce(() => {
      throw new Error('The database is not connected: call connect() first')
    })

    await expect(
      createProductRepository(database).list(plain, { sort: 'default', skip: 0, limit: 20 }),
    ).rejects.toThrow('not connected')
  })
})

describe('findByIds', () => {
  it('asks for the products by their id in one query, without the internal fields', async () => {
    fake.cursor.toArray.mockResolvedValue([a, b])

    const found = await createProductRepository(database).findByIds(['A-1', 'B-2', 'GONE'])

    expect(fake.collection.find).toHaveBeenCalledTimes(1)
    expect(fake.collection.find).toHaveBeenCalledWith(
      { id: { $in: ['A-1', 'B-2', 'GONE'] } },
      { projection: { _id: 0, search: 0 } },
    )
    expect(found).toEqual([a, b])
  })

  it('uses the ids as values, never as part of the query', async () => {
    const hostile = '{"$ne":""}'

    await createProductRepository(database).findByIds([hostile])

    expect(fake.collection.find).toHaveBeenCalledWith(
      { id: { $in: [hostile] } },
      { projection: { _id: 0, search: 0 } },
    )
  })

  it('refuses a stored document that is not a valid product', async () => {
    fake.cursor.toArray.mockResolvedValue([{ id: 'A-1' }])

    await expect(createProductRepository(database).findByIds(['A-1'])).rejects.toThrow(
      'The stored product "A-1" does not match the product schema',
    )
  })
})

describe('findById', () => {
  it('looks up by the product id, not by _id, without the internal _id', async () => {
    fake.collection.findOne.mockResolvedValue(a)

    const product = await createProductRepository(database).findById('A-1')

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { id: 'A-1' },
      { projection: { _id: 0, search: 0 } },
    )
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
      { projection: { _id: 0, search: 0 } },
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
      {
        updateOne: {
          filter: { id: 'A-1' },
          update: { $set: { ...a, search: buildSearchFields(a) } },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { id: 'B-2' },
          update: { $set: { ...b, search: buildSearchFields(b) } },
          upsert: true,
        },
      },
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

describe('list with a filter', () => {
  const filter: ProductFilter = {
    category: 'cpu',
    brands: ['amd'],
    search: { query: 'ryzen', deep: false },
    specs: new Map([['תושבת מעבד', ['AM5']]]),
  }

  it('asks MongoDB for the filter, and counts with the same filter', async () => {
    const repository = createProductRepository(database)

    await repository.list(filter, { sort: 'default', skip: 0, limit: 20 })

    const query = fake.collection.find.mock.calls[0]?.[0] as { $and: unknown[] }
    expect(query.$and).toHaveLength(4)
    expect(query.$and[0]).toEqual({ category: 'cpu' })
    expect(query.$and[1]).toEqual({ brand: { $in: ['amd'] } })
    expect(fake.collection.countDocuments).toHaveBeenCalledWith(query)
  })

  it('does not use a collation for the default order, which is the plain order of the id', async () => {
    await createProductRepository(database).list(plain, { sort: 'default', skip: 0, limit: 20 })

    expect(fake.collection.find).toHaveBeenCalledWith({}, { projection: { _id: 0, search: 0 } })
  })

  it.each([
    ['price-asc', { 'price.current': 1, name: 1, id: 1 }],
    ['price-desc', { 'price.current': -1, name: 1, id: 1 }],
    ['name-asc', { name: 1, id: 1 }],
    ['name-desc', { name: -1, id: 1 }],
  ] as const)('sorts "%s" on MongoDB with the Hebrew numeric collation', async (sort, order) => {
    await createProductRepository(database).list(plain, { sort, skip: 40, limit: 10 })

    expect(fake.collection.find).toHaveBeenCalledWith(
      {},
      {
        projection: { _id: 0, search: 0 },
        collation: { locale: 'he', numericOrdering: true },
      },
    )
    expect(fake.cursor.sort).toHaveBeenCalledWith(order)
    expect(fake.cursor.skip).toHaveBeenCalledWith(40)
    expect(fake.cursor.limit).toHaveBeenCalledWith(10)
  })

  it('never counts with a collation, so the filter means the same everywhere', async () => {
    await createProductRepository(database).list(plain, { sort: 'name-asc', skip: 0, limit: 5 })

    expect(fake.collection.countDocuments).toHaveBeenCalledWith({})
  })
})

describe('findAll', () => {
  it('reads every match by id, without _id and the search text', async () => {
    fake.cursor.toArray.mockResolvedValue([a, b])

    const items = await createProductRepository(database).findAll({ ...plain, category: 'gpu' })

    expect(fake.collection.find).toHaveBeenCalledWith(
      { $and: [{ category: 'gpu' }] },
      { projection: { _id: 0, search: 0 } },
    )
    expect(fake.cursor.sort).toHaveBeenCalledWith({ id: 1 })
    expect(fake.cursor.skip).not.toHaveBeenCalled()
    expect(items).toEqual([a, b])
  })
})

describe('count', () => {
  it('counts the products that match the filter', async () => {
    fake.collection.countDocuments.mockResolvedValue(7)

    const count = await createProductRepository(database).count({ ...plain, brands: ['intel'] })

    expect(fake.collection.countDocuments).toHaveBeenCalledWith({
      $and: [{ brand: { $in: ['intel'] } }],
    })
    expect(count).toBe(7)
  })
})

describe('brandCounts', () => {
  it('groups the matching products by brand, in the database', async () => {
    fake.cursor.toArray.mockResolvedValue([
      { _id: 'amd', count: 3 },
      { _id: 'intel', count: 8 },
    ])

    const counts = await createProductRepository(database).brandCounts({
      ...plain,
      category: 'cpu',
    })

    expect(fake.collection.aggregate).toHaveBeenCalledWith([
      { $match: { $and: [{ category: 'cpu' }] } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
    ])
    expect(counts).toEqual([
      { brand: 'amd', count: 3 },
      { brand: 'intel', count: 8 },
    ])
  })

  it('leaves out a brand the storefront does not know', async () => {
    fake.cursor.toArray.mockResolvedValue([
      { _id: 'amd', count: 3 },
      { _id: 'nvidia', count: 1 },
    ])

    expect(await createProductRepository(database).brandCounts(plain)).toEqual([
      { brand: 'amd', count: 3 },
    ])
  })
})

describe('categoryCounts', () => {
  it('groups the whole collection by category, in the database', async () => {
    fake.cursor.toArray.mockResolvedValue([
      { _id: 'cpu', count: 4 },
      { _id: 'gpu', count: 6 },
    ])

    const counts = await createProductRepository(database).categoryCounts()

    expect(fake.collection.aggregate).toHaveBeenCalledWith([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ])
    expect(counts).toEqual([
      { category: 'cpu', count: 4 },
      { category: 'gpu', count: 6 },
    ])
  })

  it('leaves out a category the storefront does not know', async () => {
    fake.cursor.toArray.mockResolvedValue([
      { _id: 'cpu', count: 4 },
      { _id: 'toaster', count: 1 },
    ])

    expect(await createProductRepository(database).categoryCounts()).toEqual([
      { category: 'cpu', count: 4 },
    ])
  })
})

describe('the lookup, sale and recommended filters', () => {
  it('are plain conditions in the query of a page', async () => {
    fake.cursor.toArray.mockResolvedValue([])
    fake.collection.countDocuments.mockResolvedValue(0)

    await createProductRepository(database).list(
      { ...plain, ids: ['A-1', 'B-2'], onSale: true, recommended: true },
      { sort: 'default', skip: 0, limit: 100 },
    )

    expect(fake.collection.find.mock.calls[0]?.[0]).toEqual({
      $and: [
        { id: { $in: ['A-1', 'B-2'] } },
        { 'price.original': { $exists: true } },
        { isRecommended: true },
      ],
    })
  })
})

describe('specValueCounts', () => {
  it('groups the matching products by specification value, counting a product once per value', async () => {
    fake.cursor.toArray.mockResolvedValue([
      { _id: { label: 'תושבת מעבד', value: 'AM5' }, count: 2 },
      { _id: { label: 'תושבת מעבד', value: 'LGA 1700' }, count: 5 },
    ])

    const counts = await createProductRepository(database).specValueCounts({
      ...plain,
      category: 'cpu',
    })

    const [pipeline] = fake.collection.aggregate.mock.calls[0] as [Record<string, unknown>[]]
    expect(pipeline?.[0]).toEqual({ $match: { $and: [{ category: 'cpu' }] } })
    expect(JSON.stringify(pipeline?.[1])).toContain('$setUnion')
    expect(pipeline?.slice(2)).toEqual([
      { $unwind: '$pairs' },
      { $group: { _id: '$pairs', count: { $sum: 1 } } },
      { $sort: { '_id.label': 1, '_id.value': 1 } },
    ])
    expect(counts).toEqual([
      { label: 'תושבת מעבד', value: 'AM5', count: 2 },
      { label: 'תושבת מעבד', value: 'LGA 1700', count: 5 },
    ])
  })
})

describe('ensureSearchFields', () => {
  it('writes the search text of the products that have none or an older version', async () => {
    fake.cursor.toArray.mockResolvedValue([a, b])

    const written = await createProductRepository(database).ensureSearchFields()

    expect(fake.collection.find).toHaveBeenCalledWith(
      { 'search.v': { $ne: SEARCH_VERSION } },
      { projection: { _id: 0, search: 0 } },
    )
    expect(fake.collection.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: { filter: { id: 'A-1' }, update: { $set: { search: buildSearchFields(a) } } },
      },
      {
        updateOne: { filter: { id: 'B-2' }, update: { $set: { search: buildSearchFields(b) } } },
      },
    ])
    expect(written).toBe(2)
  })

  it('writes nothing when every product is up to date', async () => {
    expect(await createProductRepository(database).ensureSearchFields()).toBe(0)

    expect(fake.collection.bulkWrite).not.toHaveBeenCalled()
  })

  it('leaves documents that are not products alone', async () => {
    fake.cursor.toArray.mockResolvedValue([a, { note: 'not a product' }])

    expect(await createProductRepository(database).ensureSearchFields()).toBe(1)

    expect(fake.collection.bulkWrite).toHaveBeenCalledWith([
      expect.objectContaining({ updateOne: expect.objectContaining({ filter: { id: 'A-1' } }) }),
    ])
  })

  it('passes on a database failure as it is', async () => {
    fake.cursor.toArray.mockRejectedValue(new Error('not primary'))

    await expect(createProductRepository(database).ensureSearchFields()).rejects.toThrow(
      'not primary',
    )
  })
})
