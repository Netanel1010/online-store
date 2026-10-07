import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/database.ts'
import {
  createOrderRepository,
  DuplicateIdempotencyKeyError,
  DuplicateOrderNumberError,
} from './repository.ts'
import type { Order } from './types.ts'

// The driver's collection is replaced by recorded calls, so these tests check WHAT the repository
// asks MongoDB (the queries, the projection, the indexes, the writes). What MongoDB does with them is
// checked against a real server by the optional integration test.
const fake = vi.hoisted(() => {
  const cursor = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), toArray: vi.fn() }
  const collection = {
    findOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    insertOne: vi.fn(),
    createIndex: vi.fn(),
    // Never to be called: an order is written once and never changed or removed.
    updateOne: vi.fn(),
    updateMany: vi.fn(),
    replaceOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
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

const order: Order = {
  orderNumber: 'DEMO-7K2M9QX4',
  userId: 'user-1',
  idempotencyKey: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b',
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
  delivery: {
    fullName: 'נתנאל כהן',
    email: 'netanel@example.com',
    phone: '050-1234567',
    city: 'חיפה',
    street: 'הנשיא',
    houseNumber: '12',
    apartment: '',
    postalCode: '',
    notes: '',
  },
}

/** MongoDB's answer to a write that breaks a unique index. */
const duplicateOn = (field: string) =>
  Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern: { [field]: 1 } })

beforeEach(() => {
  vi.clearAllMocks()
  fake.cursor.sort.mockReturnValue(fake.cursor)
  fake.cursor.skip.mockReturnValue(fake.cursor)
  fake.cursor.limit.mockReturnValue(fake.cursor)
  fake.cursor.toArray.mockResolvedValue([])
  fake.collection.find.mockReturnValue(fake.cursor)
  fake.collection.findOne.mockResolvedValue(null)
  fake.collection.countDocuments.mockResolvedValue(0)
  fake.collection.insertOne.mockResolvedValue({ acknowledged: true })
  fake.collection.createIndex.mockResolvedValue('index')
})

describe('the collection', () => {
  it('is "orders", looked up when used and not when the repository is created', async () => {
    const repository = createOrderRepository(database)
    expect(database.db).not.toHaveBeenCalled()

    await repository.findByOrderNumber('user-1', order.orderNumber)

    expect(fake.collectionOf).toHaveBeenCalledWith('orders')
  })
})

describe('ensureIndexes', () => {
  it('creates the three indexes, and only those', async () => {
    await createOrderRepository(database).ensureIndexes()

    expect(fake.collection.createIndex).toHaveBeenCalledTimes(3)
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { orderNumber: 1 },
      { unique: true, name: 'orderNumber_unique' },
    )
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { userId: 1, idempotencyKey: 1 },
      { unique: true, name: 'userId_idempotencyKey_unique' },
    )
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { userId: 1, createdAt: -1, _id: -1 },
      { name: 'userId_createdAt_id' },
    )
  })

  it('passes on a database failure as it is', async () => {
    fake.collection.createIndex.mockRejectedValue(new Error('not primary'))

    await expect(createOrderRepository(database).ensureIndexes()).rejects.toThrow('not primary')
  })
})

describe('create', () => {
  it("inserts the order, as a copy, so the caller's object is not changed by the driver", async () => {
    const mine = structuredClone(order)

    await createOrderRepository(database).create(mine)

    expect(fake.collection.insertOne).toHaveBeenCalledTimes(1)
    const [stored] = fake.collection.insertOne.mock.calls[0]!
    expect(stored).toEqual(order)
    expect(stored).not.toBe(mine)
  })

  it('says the idempotency key is taken when that unique index refuses', async () => {
    fake.collection.insertOne.mockRejectedValue(duplicateOn('idempotencyKey'))

    await expect(createOrderRepository(database).create(order)).rejects.toBeInstanceOf(
      DuplicateIdempotencyKeyError,
    )
  })

  it('says the order number is taken when that unique index refuses', async () => {
    fake.collection.insertOne.mockRejectedValue(duplicateOn('orderNumber'))

    await expect(createOrderRepository(database).create(order)).rejects.toBeInstanceOf(
      DuplicateOrderNumberError,
    )
  })

  it.each([
    ['a duplicate on a field it does not know', duplicateOn('somethingElse')],
    ['a duplicate with no key pattern', Object.assign(new Error('dup'), { code: 11000 })],
    ['a failed write', new Error('not primary')],
    ['a timeout', Object.assign(new Error('timed out'), { code: 50 })],
  ])('passes on %s as it is', async (_name, error) => {
    fake.collection.insertOne.mockRejectedValue(error)

    await expect(createOrderRepository(database).create(order)).rejects.toBe(error)
  })
})

describe('finding an order', () => {
  it('looks up by the account AND the order number, without the internal _id', async () => {
    fake.collection.findOne.mockResolvedValue(order)

    const found = await createOrderRepository(database).findByOrderNumber(
      'user-1',
      order.orderNumber,
    )

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { userId: 'user-1', orderNumber: order.orderNumber },
      { projection: { _id: 0 } },
    )
    expect(found).toEqual(order)
  })

  it("returns null when there is none, which is also what another account's order looks like", async () => {
    expect(
      await createOrderRepository(database).findByOrderNumber('user-2', order.orderNumber),
    ).toBeNull()
  })

  it('looks up by the account AND the idempotency key', async () => {
    fake.collection.findOne.mockResolvedValue(order)

    const found = await createOrderRepository(database).findByIdempotencyKey(
      'user-1',
      order.idempotencyKey,
    )

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { userId: 'user-1', idempotencyKey: order.idempotencyKey },
      { projection: { _id: 0 } },
    )
    expect(found).toEqual(order)
  })

  it('uses the values as values, never as part of the query', async () => {
    const hostile = '{"$ne":""}'

    await createOrderRepository(database).findByOrderNumber(hostile, hostile)

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { userId: hostile, orderNumber: hostile },
      { projection: { _id: 0 } },
    )
  })

  it('refuses a stored document that is not a valid order, without quoting it', async () => {
    fake.collection.findOne.mockResolvedValue({
      orderNumber: 'DEMO-7K2M9QX4',
      delivery: { phone: '0501234567' },
    })

    const failure = createOrderRepository(database).findByOrderNumber('user-1', order.orderNumber)

    await expect(failure).rejects.toThrow('A stored order does not match the order schema')
    await expect(failure).rejects.not.toThrow(/0501234567/)
  })

  it.each([
    [
      'a line with a null original price',
      { ...order, lines: [{ ...order.lines[0], originalUnitPrice: null }] },
    ],
    ['a price that is not whole', { ...order, lines: [{ ...order.lines[1], unitPrice: 10.5 }] }],
    ['no lines', { ...order, lines: [] }],
    ['another status', { ...order, status: 'shipped' }],
  ])('refuses a stored order with %s', async (_name, document) => {
    fake.collection.findOne.mockResolvedValue(document)

    await expect(
      createOrderRepository(database).findByOrderNumber('user-1', order.orderNumber),
    ).rejects.toThrow('A stored order does not match the order schema')
  })
})

describe('listForUser', () => {
  it("asks for the account's orders only, the newest first, then the page, and counts them", async () => {
    fake.cursor.toArray.mockResolvedValue([order])
    fake.collection.countDocuments.mockResolvedValue(7)

    const result = await createOrderRepository(database).listForUser('user-1', {
      skip: 20,
      limit: 10,
    })

    expect(fake.collection.find).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { projection: { _id: 0 } },
    )
    expect(fake.cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 })
    expect(fake.cursor.skip).toHaveBeenCalledWith(20)
    expect(fake.cursor.limit).toHaveBeenCalledWith(10)
    expect(fake.collection.countDocuments).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(result).toEqual({ items: [order], total: 7 })
  })
})

describe('what the repository never does', () => {
  it('does not update, replace or delete an order', async () => {
    const repository = createOrderRepository(database)
    await repository.ensureIndexes()
    await repository.create(order)
    await repository.findByOrderNumber('user-1', order.orderNumber)
    await repository.findByIdempotencyKey('user-1', order.idempotencyKey)
    await repository.listForUser('user-1', { skip: 0, limit: 20 })

    for (const name of [
      'updateOne',
      'updateMany',
      'replaceOne',
      'findOneAndUpdate',
      'deleteOne',
      'deleteMany',
      'drop',
    ] as const) {
      expect(fake.collection[name]).not.toHaveBeenCalled()
    }
  })
})
