import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { createMemoryOrderRepository } from '../testing/memoryOrderRepository.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct } from '../testing/products.ts'
import { DuplicateOrderNumberError, type OrderRepository } from './repository.ts'
import type { PlaceOrderInput } from './schemas.ts'
import { createOrderService } from './service.ts'

const ME = 'user-me'
const SOMEONE = 'user-someone'
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
const sale = makeProduct({
  id: 'SALE-1',
  name: 'On sale',
  price: { current: 800, original: 1000 },
})

let clock = new Date('2026-01-01T10:00:00Z')
let orders: ReturnType<typeof createMemoryOrderRepository>
let catalog: ReturnType<typeof createMemoryProductRepository>

/** Order numbers ORD-1, ORD-2, ... unless a test supplies its own. */
function setUp(generate?: () => string) {
  orders = createMemoryOrderRepository()
  catalog = createMemoryProductRepository([card, sale])
  let counter = 0
  return createOrderService({
    orders: orders.repository,
    products: catalog.repository,
    now: () => clock,
    generateOrderNumber: generate ?? (() => `DEMO-0000000${(counter += 1)}`),
  })
}

const input = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  items: [{ productId: 'GV-N4060', quantity: 2 }],
  delivery: DELIVERY,
  ...overrides,
})

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof HttpError) return error
    throw error
  }
  throw new Error('it did not throw')
}

let service: ReturnType<typeof setUp>
beforeEach(() => {
  clock = new Date('2026-01-01T10:00:00Z')
  service = setUp()
})

describe('placing an order: what it costs', () => {
  it('works the lines and the amounts out from the products the server holds', async () => {
    const { order, created } = await service.place(
      ME,
      input({
        items: [
          { productId: 'GV-N4060', quantity: 2 },
          { productId: 'SALE-1', quantity: 3 },
        ],
      }),
      KEY,
    )

    expect(created).toBe(true)
    expect(order.lines).toEqual([
      { productId: 'GV-N4060', name: 'RTX 4060', unitPrice: 1500, quantity: 2 },
      {
        productId: 'SALE-1',
        name: 'On sale',
        unitPrice: 800,
        originalUnitPrice: 1000,
        quantity: 3,
      },
    ])
    expect(order.total).toBe(1500 * 2 + 800 * 3)
    expect(order.originalTotal).toBe(1500 * 2 + 1000 * 3)
    expect(order.savings).toBe(600)
  })

  it('keeps the lines in the order the client sent them, and has no sale fields without a sale', async () => {
    const { order } = await service.place(
      ME,
      input({
        items: [
          { productId: 'SALE-1', quantity: 1 },
          { productId: 'GV-N4060', quantity: 1 },
        ],
      }),
      KEY,
    )

    expect(order.lines.map((line) => line.productId)).toEqual(['SALE-1', 'GV-N4060'])
    expect(order.lines[1]).not.toHaveProperty('originalUnitPrice')
    expect(order.savings).toBe(200)
  })

  it('gives the order its number, its time, its state and the delivery details', async () => {
    const { order } = await service.place(ME, input(), KEY)

    expect(order.orderNumber).toBe('DEMO-00000001')
    expect(order.createdAt).toBe('2026-01-01T10:00:00.000Z')
    expect(order.status).toBe('placed')
    expect(order.delivery).toEqual(DELIVERY)
  })

  it('shows nothing that identifies the account or the request', async () => {
    const { order } = await service.place(ME, input(), KEY)

    expect(Object.keys(order).sort()).toEqual([
      'createdAt',
      'delivery',
      'lines',
      'orderNumber',
      'originalTotal',
      'savings',
      'status',
      'total',
    ])
    expect(JSON.stringify(order)).not.toContain(ME)
    expect(JSON.stringify(order)).not.toContain(KEY)
  })

  it('stores the order for the account, with the key and a digest of the request', async () => {
    await service.place(ME, input(), KEY)

    expect(orders.stored).toHaveLength(1)
    expect(orders.stored[0]).toMatchObject({ userId: ME, idempotencyKey: KEY, status: 'placed' })
    expect(orders.stored[0]!.requestHash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('placing an order: a price is a snapshot', () => {
  it('is not changed by a later change to the product', async () => {
    const { order } = await service.place(ME, input(), KEY)

    await catalog.repository.upsertMany([
      makeProduct({ id: 'GV-N4060', name: 'Renamed', price: { current: 9999 } }),
    ])

    const again = await service.get(ME, order.orderNumber)
    expect(again.lines[0]).toMatchObject({ name: 'RTX 4060', unitPrice: 1500 })
    expect(again.total).toBe(3000)
  })

  it('uses the price at the moment of the order', async () => {
    await catalog.repository.upsertMany([makeProduct({ id: 'GV-N4060', price: { current: 2000 } })])

    const { order } = await service.place(ME, input(), KEY)

    expect(order.total).toBe(4000)
  })
})

describe('placing an order: products that are not available', () => {
  it('refuses with 409 product_unavailable and names the products, never leaving them out', async () => {
    const error = await failure(
      service.place(
        ME,
        input({
          items: [
            { productId: 'GV-N4060', quantity: 1 },
            { productId: 'GONE-1', quantity: 1 },
            { productId: 'GONE-2', quantity: 4 },
          ],
        }),
        KEY,
      ),
    )

    expect(error.status).toBe(409)
    expect(error.code).toBe('product_unavailable')
    expect(error.details).toEqual({ productIds: ['GONE-1', 'GONE-2'] })
  })

  it('stores nothing when one product is unavailable', async () => {
    await failure(service.place(ME, input({ items: [{ productId: 'GONE-1', quantity: 1 }] }), KEY))

    expect(orders.stored).toHaveLength(0)
  })

  it('still refuses a key that was only used for a refused request', async () => {
    await failure(service.place(ME, input({ items: [{ productId: 'GONE-1', quantity: 1 }] }), KEY))

    const { created } = await service.place(ME, input(), KEY)

    expect(created).toBe(true)
  })
})

describe('placing an order: the total the visitor saw', () => {
  it('accepts an expected total that is what the server works out', async () => {
    const { order } = await service.place(ME, input({ expectedTotal: 3000 }), KEY)

    expect(order.total).toBe(3000)
  })

  it('refuses with 409 price_changed, giving both totals, and stores nothing', async () => {
    const error = await failure(service.place(ME, input({ expectedTotal: 2800 }), KEY))

    expect(error.status).toBe(409)
    expect(error.code).toBe('price_changed')
    expect(error.details).toEqual({ expectedTotal: 2800, total: 3000 })
    expect(orders.stored).toHaveLength(0)
  })

  it('treats an expected total of 0 as a total, not as "none"', async () => {
    const error = await failure(service.place(ME, input({ expectedTotal: 0 }), KEY))

    expect(error.code).toBe('price_changed')
  })

  it('lets the visitor retry with the new total', async () => {
    await failure(service.place(ME, input({ expectedTotal: 2800 }), KEY))

    const { order } = await service.place(ME, input({ expectedTotal: 3000 }), KEY)

    expect(order.total).toBe(3000)
  })

  it('says a product is unavailable before it says the price changed', async () => {
    const error = await failure(
      service.place(
        ME,
        input({ items: [{ productId: 'GONE-1', quantity: 1 }], expectedTotal: 1 }),
        KEY,
      ),
    )

    expect(error.code).toBe('product_unavailable')
  })
})

describe('placing an order: the same request twice', () => {
  it('makes one order and gives the same order back', async () => {
    const first = await service.place(ME, input(), KEY)
    const second = await service.place(ME, input(), KEY)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.order).toEqual(first.order)
    expect(orders.stored).toHaveLength(1)
  })

  it('gives the order back even when the prices have changed since', async () => {
    const first = await service.place(ME, input({ expectedTotal: 3000 }), KEY)
    await catalog.repository.upsertMany([makeProduct({ id: 'GV-N4060', price: { current: 2000 } })])

    const second = await service.place(ME, input({ expectedTotal: 3000 }), KEY)

    expect(second.created).toBe(false)
    expect(second.order).toEqual(first.order)
  })

  it('gives the order back even when the products are no longer available', async () => {
    const first = await service.place(ME, input(), KEY)
    catalog = createMemoryProductRepository([])
    service = createOrderService({ orders: orders.repository, products: catalog.repository })

    const second = await service.place(ME, input(), KEY)

    expect(second.order.orderNumber).toBe(first.order.orderNumber)
  })

  it('knows it is the same request however the products were listed', async () => {
    const lines = [
      { productId: 'GV-N4060', quantity: 1 },
      { productId: 'SALE-1', quantity: 2 },
    ]
    await service.place(ME, input({ items: lines }), KEY)

    const retry = await service.place(ME, input({ items: [...lines].reverse() }), KEY)

    expect(retry.created).toBe(false)
  })

  it('does not count the expected total as part of what was ordered', async () => {
    await service.place(ME, input(), KEY)

    const retry = await service.place(ME, input({ expectedTotal: 3000 }), KEY)

    expect(retry.created).toBe(false)
  })

  it.each([
    ['another quantity', input({ items: [{ productId: 'GV-N4060', quantity: 3 }] })],
    ['another product', input({ items: [{ productId: 'SALE-1', quantity: 2 }] })],
    ['another address', input({ delivery: { ...DELIVERY, city: 'תל אביב' } })],
  ])('refuses the key with %s with 409 idempotency_key_reuse', async (_name, other) => {
    await service.place(ME, input(), KEY)

    const error = await failure(service.place(ME, other, KEY))

    expect(error.status).toBe(409)
    expect(error.code).toBe('idempotency_key_reuse')
    expect(orders.stored).toHaveLength(1)
  })

  it('makes a second order for the same content under another key', async () => {
    await service.place(ME, input(), KEY)

    const second = await service.place(ME, input(), `${KEY}-2`)

    expect(second.created).toBe(true)
    expect(orders.stored).toHaveLength(2)
  })

  it('makes only one order when the same request arrives at the same moment', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.place(ME, input(), KEY)),
    )

    expect(orders.stored).toHaveLength(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
    const numbers = new Set(results.map((result) => result.order.orderNumber))
    expect(numbers.size).toBe(1)
  })

  it('does not mix up two accounts that use the same key', async () => {
    const mine = await service.place(ME, input(), KEY)
    const theirs = await service.place(SOMEONE, input(), KEY)

    expect(theirs.created).toBe(true)
    expect(theirs.order.orderNumber).not.toBe(mine.order.orderNumber)
    expect(orders.stored).toHaveLength(2)
  })
})

describe('placing an order: an order number that is taken', () => {
  it('draws again and places the order', async () => {
    const draws = ['DEMO-AAAAAAAA', 'DEMO-AAAAAAAA', 'DEMO-BBBBBBBB']
    service = setUp(() => draws.shift() ?? 'DEMO-CCCCCCCC')
    await service.place(ME, input(), KEY)

    const second = await service.place(ME, input(), `${KEY}-2`)

    expect(second.created).toBe(true)
    expect(second.order.orderNumber).toBe('DEMO-BBBBBBBB')
    expect(orders.stored.map((order) => order.orderNumber)).toEqual([
      'DEMO-AAAAAAAA',
      'DEMO-BBBBBBBB',
    ])
  })

  it('gives up with an error, not a duplicate, after five numbers in a row are taken', async () => {
    const generate = vi.fn(() => 'DEMO-AAAAAAAA')
    service = setUp(generate)
    await service.place(ME, input(), KEY)
    generate.mockClear()

    await expect(service.place(ME, input(), `${KEY}-2`)).rejects.toThrow(
      'No free order number was found',
    )

    expect(generate).toHaveBeenCalledTimes(5)
    expect(orders.stored).toHaveLength(1)
  })

  it('does not hide an error that is not a collision', async () => {
    const broken: OrderRepository = {
      ...orders.repository,
      findByIdempotencyKey: () => Promise.resolve(null),
      create: () => Promise.reject(new Error('not primary')),
    }
    service = createOrderService({ orders: broken, products: catalog.repository })

    await expect(service.place(ME, input(), KEY)).rejects.toThrow('not primary')
  })

  it('keeps the same order content when it draws again', async () => {
    const seen: string[] = []
    const flaky: OrderRepository = {
      ...orders.repository,
      create: (order) => {
        seen.push(JSON.stringify([order.lines, order.total, order.createdAt]))
        return seen.length === 1
          ? Promise.reject(new DuplicateOrderNumberError())
          : orders.repository.create(order)
      },
    }
    service = createOrderService({ orders: flaky, products: catalog.repository, now: () => clock })

    await service.place(ME, input(), KEY)

    expect(seen).toHaveLength(2)
    expect(seen[1]).toBe(seen[0])
  })
})

describe('an account only sees its own orders', () => {
  it('finds an order of its own', async () => {
    const { order } = await service.place(ME, input(), KEY)

    expect(await service.get(ME, order.orderNumber)).toEqual(order)
  })

  it('answers 404 order_not_found for the order of another account', async () => {
    const { order } = await service.place(ME, input(), KEY)

    const error = await failure(service.get(SOMEONE, order.orderNumber))

    expect(error.status).toBe(404)
    expect(error.code).toBe('order_not_found')
  })

  it('answers the same 404 for an order that does not exist', async () => {
    const error = await failure(service.get(ME, 'DEMO-ZZZZZZZZ'))

    expect(error.status).toBe(404)
    expect(error.code).toBe('order_not_found')
  })
})

describe('listing orders', () => {
  async function place(userId: string, minutes: number, key: string) {
    clock = new Date(Date.UTC(2026, 0, 1, 10, minutes))
    return (await service.place(userId, input(), key)).order
  }

  it('lists the newest first, with the totals of the page', async () => {
    const oldest = await place(ME, 0, 'key-aaaaaaaaaaaaaaaa')
    const middle = await place(ME, 5, 'key-bbbbbbbbbbbbbbbb')
    const newest = await place(ME, 9, 'key-cccccccccccccccc')

    const page = await service.list(ME)

    expect(page.items.map((order) => order.orderNumber)).toEqual([
      newest.orderNumber,
      middle.orderNumber,
      oldest.orderNumber,
    ])
    expect(page).toMatchObject({ page: 1, limit: 20, total: 3, totalPages: 1 })
  })

  it('puts orders made in the same moment in the order they were made, the last one first', async () => {
    const first = await place(ME, 0, 'key-aaaaaaaaaaaaaaaa')
    const second = await place(ME, 0, 'key-bbbbbbbbbbbbbbbb')

    const page = await service.list(ME)

    expect(page.items.map((order) => order.orderNumber)).toEqual([
      second.orderNumber,
      first.orderNumber,
    ])
  })

  it('lists only the orders of the account', async () => {
    await place(ME, 0, 'key-aaaaaaaaaaaaaaaa')
    const theirs = await place(SOMEONE, 1, 'key-bbbbbbbbbbbbbbbb')

    const mine = await service.list(ME)
    const others = await service.list(SOMEONE)

    expect(mine.total).toBe(1)
    expect(mine.items.map((order) => order.orderNumber)).not.toContain(theirs.orderNumber)
    expect(others.items.map((order) => order.orderNumber)).toEqual([theirs.orderNumber])
  })

  it('pages, and says how many pages there are', async () => {
    for (let minute = 0; minute < 5; minute += 1)
      await place(ME, minute, `key-${minute}`.padEnd(16, 'x'))

    const second = await service.list(ME, { page: 2, limit: 2 })
    const last = await service.list(ME, { page: 3, limit: 2 })
    const beyond = await service.list(ME, { page: 4, limit: 2 })

    expect(second).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 })
    expect(second.items).toHaveLength(2)
    expect(last.items).toHaveLength(1)
    expect(beyond.items).toEqual([])
    expect(beyond.total).toBe(5)
  })

  it('has an empty first page for an account with no orders', async () => {
    expect(await service.list(ME)).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    })
  })

  it.each([
    [{ page: 0 }],
    [{ page: -1 }],
    [{ page: 1.5 }],
    [{ limit: 0 }],
    [{ limit: 101 }],
    [{ limit: 2.5 }],
    [{ page: Number.MAX_SAFE_INTEGER, limit: 100 }],
  ])('refuses %j with the 400 of the product pages', async (params) => {
    const error = await failure(service.list(ME, params))

    expect(error.status).toBe(400)
    expect(error.code).toBe('invalid_pagination')
  })

  it('allows a limit of 100', async () => {
    await expect(service.list(ME, { limit: 100 })).resolves.toMatchObject({ limit: 100 })
  })
})
