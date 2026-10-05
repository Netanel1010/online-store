import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import type { Database } from '../db/database.ts'
import { errorHandler, type ErrorBody } from '../middleware/errorHandler.ts'
import { notFound } from '../middleware/notFound.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { listen } from '../testing/listen.ts'
import { readSourceCatalog } from '../testing/products.ts'
import { createProductsRouter } from './routes.ts'
import { validateCatalog } from './seed.ts'
import { createProductService } from './service.ts'
import type { Product, ProductPage } from './types.ts'

const catalog = validateCatalog(readSourceCatalog())
const sortedIds = catalog.map((product) => product.id).sort()

const logger = { error: vi.fn() }

// The real routes, service and error handling over an in-memory repository.
const app = express()
app.use(
  '/api/products',
  createProductsRouter(createProductService(createMemoryProductRepository(catalog).repository)),
)
app.use(notFound)
app.use(errorHandler(logger))

let api: Awaited<ReturnType<typeof listen>>
beforeAll(async () => {
  api = await listen(app)
})
afterAll(() => api.close())

const get = (path: string) => fetch(`${api.url}/api/products${path}`)
const pageOf = async (path: string) => (await (await get(path)).json()) as ProductPage
const errorOf = async (path: string) => {
  const response = await get(path)
  return { status: response.status, body: (await response.json()) as ErrorBody }
}

describe('GET /api/products', () => {
  it('returns the first page with the default size, and the numbers to build a pager', async () => {
    const response = await get('')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    const body = (await response.json()) as ProductPage
    expect(Object.keys(body).sort()).toEqual(['items', 'limit', 'page', 'total', 'totalPages'])
    expect(body).toMatchObject({ page: 1, limit: 20, total: 31, totalPages: 2 })
    expect(body.items.map((item) => item.id)).toEqual(sortedIds.slice(0, 20))
  })

  it('returns the other page, with what is left', async () => {
    const body = await pageOf('?page=2')

    expect(body).toMatchObject({ page: 2, limit: 20, total: 31, totalPages: 2 })
    expect(body.items.map((item) => item.id)).toEqual(sortedIds.slice(20))
  })

  it('honours page and limit together', async () => {
    const body = await pageOf('?page=3&limit=10')

    expect(body).toMatchObject({ page: 3, limit: 10, total: 31, totalPages: 4 })
    expect(body.items.map((item) => item.id)).toEqual(sortedIds.slice(20, 30))
  })

  it('has no overlap between pages, and together they are the whole catalog once', async () => {
    const seen: string[] = []
    for (const page of [1, 2, 3, 4]) {
      seen.push(...(await pageOf(`?page=${page}&limit=10`)).items.map((item) => item.id))
    }

    expect(seen).toEqual(sortedIds)
  })

  it('accepts the largest page size', async () => {
    const body = await pageOf('?limit=100')

    expect(body.items).toHaveLength(31)
    expect(body.totalPages).toBe(1)
  })

  it('answers a page past the end with an empty list and the real total', async () => {
    expect(await pageOf('?page=50')).toEqual({
      items: [],
      page: 50,
      limit: 20,
      total: 31,
      totalPages: 2,
    })
  })

  it('returns whole products, with no MongoDB _id', async () => {
    const [first] = (await pageOf('?limit=1')).items

    expect(first).toEqual(catalog.find((product) => product.id === sortedIds[0]))
    expect(first).not.toHaveProperty('_id')
  })

  it('never turns bracket syntax into an operator object: it is only an unknown parameter', async () => {
    // Express's default query parser keeps `page[$gt]` as a plain key. If a nested parser were
    // ever enabled, the schema rejects objects (see schemas.test.ts).
    expect(await pageOf('?page[$gt]=0&limit[$ne]=1')).toMatchObject({ page: 1, limit: 20 })
  })

  it('ignores parameters it does not know', async () => {
    expect(await pageOf('?limit=5&sort=price&q=x')).toMatchObject({ limit: 5, page: 1 })
  })

  it.each([
    'page=0',
    'page=-1',
    'page=abc',
    'page=1.5',
    'page=',
    'page=1e2',
    'page=1&page=2',
    'page=99999999999',
    'limit=0',
    'limit=101',
    'limit=100000',
    'limit=-5',
    'limit=ten',
    'limit=',
  ])('rejects ?%s with a 400 in the standard error format', async (query) => {
    const { status, body } = await errorOf(`?${query}`)

    expect(status).toBe(400)
    expect(body).toEqual({
      error: {
        code: 'invalid_pagination',
        message: 'page must be a positive integer and limit an integer from 1 to 100',
      },
    })
  })
})

describe('GET /api/products/:id', () => {
  it('returns the product', async () => {
    const expected = catalog[3]!

    const response = await get(`/${expected.id}`)

    expect(response.status).toBe(200)
    const product = (await response.json()) as Product
    expect(product).toEqual(expected)
    expect(product).not.toHaveProperty('_id')
  })

  it('finds every product of the catalog by its id', async () => {
    for (const product of catalog) {
      const response = await get(`/${encodeURIComponent(product.id)}`)
      expect(response.status, product.id).toBe(200)
    }
  })

  it('answers a product that does not exist with a 404', async () => {
    const { status, body } = await errorOf('/DOES-NOT-EXIST')

    expect(status).toBe(404)
    expect(body).toEqual({ error: { code: 'product_not_found', message: 'Product not found' } })
  })

  it('finds a product by its exact id only', async () => {
    const id = catalog[0]!.id

    expect((await errorOf(`/${id.toLowerCase()}`)).status).toBe(404)
  })

  it.each([
    ['a space', '/has%20space'],
    ['a path trick', '/..%2Fetc%2Fpasswd'],
    ['an encoded slash', '/a%2Fb'],
    ['an operator', '/%7B%22%24ne%22%3A%22%22%7D'],
    ['a dollar sign', '/%24where'],
    ['a leading dash', '/-x'],
    ['65 characters', `/${'x'.repeat(65)}`],
    ['non-latin text', `/${encodeURIComponent('עברית')}`],
  ])('rejects an id with %s with a 400', async (_name, path) => {
    const { status, body } = await errorOf(path)

    expect(status).toBe(400)
    expect(body).toEqual({
      error: { code: 'invalid_product_id', message: 'The product id is not valid' },
    })
  })

  it('does not let the query string change the lookup', async () => {
    const { status } = await errorOf('/DOES-NOT-EXIST?id[$ne]=x&id=' + catalog[0]!.id)

    expect(status).toBe(404)
  })
})

describe('other routes', () => {
  it('has no routes for writing: the API is read only', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`${api.url}/api/products/${catalog[0]!.id}`, { method })
      expect(response.status, method).toBe(404)
    }
  })

  it('does not match deeper paths', async () => {
    expect((await errorOf(`/${catalog[0]!.id}/extra`)).status).toBe(404)
  })
})

// The whole stack through createApp: router, service and the real repository, with the driver's
// collection replaced by one that fails or answers.
describe('through the application', () => {
  const collection = {
    find: vi.fn(),
    findOne: vi.fn(),
    countDocuments: vi.fn(),
  }
  const database = {
    db: () => ({ collection: () => collection }),
  } as unknown as Database
  const cursor = { sort: vi.fn(), skip: vi.fn(), limit: vi.fn(), toArray: vi.fn() }

  let withDatabase: Awaited<ReturnType<typeof listen>>
  let withoutDatabase: Awaited<ReturnType<typeof listen>>
  beforeAll(async () => {
    withDatabase = await listen(createApp({ corsOrigins: [] }, logger, database))
    withoutDatabase = await listen(createApp({ corsOrigins: [] }, logger))
  })
  afterAll(async () => {
    await withDatabase.close()
    await withoutDatabase.close()
  })
  beforeEach(() => {
    vi.clearAllMocks()
    cursor.sort.mockReturnValue(cursor)
    cursor.skip.mockReturnValue(cursor)
    cursor.limit.mockReturnValue(cursor)
    collection.find.mockReturnValue(cursor)
  })

  it('serves what the database returns', async () => {
    cursor.toArray.mockResolvedValue([catalog[0]!])
    collection.countDocuments.mockResolvedValue(31)

    const response = await fetch(`${withDatabase.url}/api/products?limit=1`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [catalog[0]],
      page: 1,
      limit: 1,
      total: 31,
      totalPages: 31,
    })
  })

  it('serves a single product from the database, and a 404 when it is not there', async () => {
    collection.findOne.mockResolvedValueOnce(catalog[0]!).mockResolvedValueOnce(null)

    const found = await fetch(`${withDatabase.url}/api/products/${catalog[0]!.id}`)
    const missing = await fetch(`${withDatabase.url}/api/products/MISSING`)

    expect(found.status).toBe(200)
    expect(missing.status).toBe(404)
  })

  it('answers a database failure with the generic 500 and keeps the details in the log', async () => {
    const secret = 'mongodb://shop:s3cret@db.example.com:27017'
    cursor.toArray.mockRejectedValue(new Error(`connection to ${secret} timed out`))
    collection.countDocuments.mockResolvedValue(31)

    const response = await fetch(`${withDatabase.url}/api/products`)
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(text)).toEqual({
      error: { code: 'internal_error', message: 'Internal server error' },
    })
    expect(text).not.toContain('s3cret')
    expect(text).not.toContain('db.example.com')
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('answers a database failure on a single product with the same generic 500', async () => {
    collection.findOne.mockRejectedValue(new Error('not primary'))

    const response = await fetch(`${withDatabase.url}/api/products/A-1`)

    expect(response.status).toBe(500)
    expect(((await response.json()) as ErrorBody).error.code).toBe('internal_error')
  })

  it('answers a stored product that is not valid with the generic 500, not with the bad data', async () => {
    collection.findOne.mockResolvedValue({ id: 'A-1', secretInternalField: 'x' })

    const response = await fetch(`${withDatabase.url}/api/products/A-1`)
    const text = await response.text()

    expect(response.status).toBe(500)
    expect(text).not.toContain('secretInternalField')
  })

  it('says a database is needed when none is configured, instead of a 404', async () => {
    const list = await fetch(`${withoutDatabase.url}/api/products`)
    const one = await fetch(`${withoutDatabase.url}/api/products/A-1`)

    expect(list.status).toBe(503)
    expect(one.status).toBe(503)
    expect(await list.json()).toEqual({
      error: {
        code: 'database_not_configured',
        message: 'This endpoint needs a database, and none is configured',
      },
    })
  })
})
