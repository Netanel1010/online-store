import express from 'express'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.ts'
import type { Database } from '../db/database.ts'
import { errorHandler, type ErrorBody } from '../middleware/errorHandler.ts'
import { notFound } from '../middleware/notFound.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { listen } from '../testing/listen.ts'
import { readSourceCatalog } from '../testing/products.ts'
import { createProductsRouter, PRODUCT_CACHE_CONTROL } from './routes.ts'
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
    expect(await pageOf('?limit=5&utm_source=x&other=1')).toMatchObject({ limit: 5, page: 1 })
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

describe('what a browser may keep', () => {
  it('lets a browser keep a listing and a product, and show them again while it asks anew', async () => {
    for (const path of ['', '?q=intel&facets=true', `/${sortedIds[0]}`]) {
      const response = await get(path)

      expect(response.status, path).toBe(200)
      expect(response.headers.get('cache-control'), path).toBe(PRODUCT_CACHE_CONTROL)
    }
    expect(PRODUCT_CACHE_CONTROL).toMatch(/max-age=\d+/)
    expect(PRODUCT_CACHE_CONTROL).toMatch(/stale-while-revalidate=\d+/)
  })

  it('never lets an error be kept', async () => {
    for (const path of ['/NOPE-404', '/bad%20id', '?page=0', '?category=nope', '?limit=1000']) {
      const response = await get(path)

      expect(response.status, path).toBeGreaterThanOrEqual(400)
      expect(response.headers.get('cache-control'), path).toBeNull()
    }
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

describe('GET /api/products with search, filters and sorting', () => {
  const idsOf = (page: ProductPage) => page.items.map((item) => item.id)
  const encode = (text: string) => encodeURIComponent(text)

  it('searches, however the text is written', async () => {
    for (const q of ['RTX 4070', 'rtx%204070', 'rtx4070', 'rtx-4070']) {
      expect(idsOf(await pageOf(`?q=${q}`)), q).toEqual(['N4070GAMINGOCV212GD'])
    }
  })

  it('searches in Hebrew', async () => {
    const gpus = catalog.filter((product) => product.category === 'gpu')
    const page = await pageOf(`?q=${encode('כרטיסי מסך')}&limit=100`)

    expect(page.total).toBe(gpus.length)
    expect(new Set(page.items.map((item) => item.category))).toEqual(new Set(['gpu']))
  })

  it('filters by category', async () => {
    const cpus = catalog.filter((product) => product.category === 'cpu')
    const page = await pageOf('?category=cpu&limit=100')

    expect(page.total).toBe(cpus.length)
    expect(idsOf(page)).toEqual(cpus.map((p) => p.id).sort())
  })

  it('filters by one brand, and by any of several', async () => {
    const amd = await pageOf('?brand=amd&limit=100')
    const either = await pageOf('?brand=amd&brand=intel&limit=100')

    expect(new Set(amd.items.map((item) => item.brand))).toEqual(new Set(['amd']))
    expect(new Set(either.items.map((item) => item.brand))).toEqual(new Set(['amd', 'intel']))
    expect(either.total).toBe(
      catalog.filter((p) => p.brand === 'amd' || p.brand === 'intel').length,
    )
  })

  it('filters by a specification of a category, with a label that needs encoding', async () => {
    const page = await pageOf(`?category=cpu&${encode('s.תושבת מעבד')}=AM5&limit=100`)

    expect(page.total).toBeGreaterThan(0)
    for (const item of page.items) {
      expect(item.specs).toContainEqual({ label: 'תושבת מעבד', value: 'AM5' })
    }
  })

  it('ignores a specification that does not exist, like the storefront always did', async () => {
    const page = await pageOf(`?category=cpu&s.fake=x&${encode('s.תושבת מעבד')}=Nope&limit=100`)

    expect(page.total).toBe(catalog.filter((product) => product.category === 'cpu').length)
  })

  it('combines the search, category, brands and specification filters', async () => {
    const page = await pageOf(
      `?q=intel&category=cpu&brand=intel&${encode('s.תמיכה בזכרון')}=DDR5&limit=100`,
    )

    expect(page.total).toBeGreaterThan(0)
    for (const item of page.items) {
      expect(item.brand).toBe('intel')
      expect(item.category).toBe('cpu')
      expect(item.specs).toContainEqual({ label: 'תמיכה בזכרון', value: 'DDR5' })
    }
  })

  it.each([
    ['price-asc', (a: Product, b: Product) => a.price.current - b.price.current],
    ['price-desc', (a: Product, b: Product) => b.price.current - a.price.current],
  ])('sorts by %s', async (sort, compare) => {
    const page = await pageOf(`?sort=${sort}&limit=100`)

    expect(page.items.map((item) => item.price.current)).toEqual(
      [...catalog].sort(compare).map((item) => item.price.current),
    )
  })

  it('sorts by name in both directions', async () => {
    const names = catalog
      .map((p) => p.name)
      .sort((a, b) => a.localeCompare(b, 'he', { numeric: true }))

    expect((await pageOf('?sort=name-asc&limit=100')).items.map((i) => i.name)).toEqual(names)
    expect((await pageOf('?sort=name-desc&limit=100')).items.map((i) => i.name)).toEqual(
      [...names].reverse(),
    )
  })

  it('pages a filtered listing, with the total and pages of the matches', async () => {
    const cpus = catalog.filter((product) => product.category === 'cpu')
    const second = await pageOf('?category=cpu&sort=price-asc&limit=4&page=2')

    expect(second).toMatchObject({
      page: 2,
      limit: 4,
      total: cpus.length,
      totalPages: Math.ceil(cpus.length / 4),
    })
    expect(second.items.map((i) => i.price.current)).toEqual(
      cpus
        .map((p) => p.price.current)
        .sort((a, b) => a - b)
        .slice(4, 8),
    )
  })

  it('answers 200 with no items when nothing matches', async () => {
    const response = await get('?q=zzzz&category=cpu')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [],
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    })
  })

  it('adds the filter options only when they are asked for', async () => {
    const without = (await (await get('?category=cpu')).json()) as ProductPage
    const withFacets = (await (await get('?category=cpu&facets=true')).json()) as ProductPage

    expect(without).not.toHaveProperty('facets')
    expect(Object.keys(withFacets).sort()).toEqual([
      'facets',
      'items',
      'limit',
      'page',
      'total',
      'totalPages',
    ])
    expect(withFacets.facets?.brands.map((option) => option.value)).toEqual(['amd', 'intel'])
    expect(withFacets.facets?.specs.map((group) => group.label)).toContain('תושבת מעבד')
    expect(withFacets.items).toEqual(without.items)
  })

  it.each([
    ['an unknown category', 'category=phones'],
    ['an unknown brand', 'brand=nvidia'],
    ['one unknown brand among known ones', 'brand=amd&brand=nope'],
    ['an unknown sort', 'sort=cheapest'],
    ['a repeated sort', 'sort=price-asc&sort=price-desc'],
    ['a search text that is too long', `q=${'a'.repeat(101)}`],
    ['a repeated search text', 'q=a&q=b'],
    ['an empty specification value', 's.x='],
    ['an empty specification label', 's.=x'],
    ['facets that is not true or false', 'facets=yes'],
  ])('answers 400 invalid_query for %s, in the usual error shape', async (_name, query) => {
    const { status, body } = await errorOf(`?${query}`)

    expect(status).toBe(400)
    expect(body.error.code).toBe('invalid_query')
    expect(Object.keys(body)).toEqual(['error'])
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message'])
  })

  it('does not repeat what was sent in the error', async () => {
    const { body } = await errorOf('?sort=secret-value')

    expect(body.error.message).not.toContain('secret-value')
  })

  it('keeps answering invalid_pagination for a bad page or limit, filters or not', async () => {
    expect((await errorOf('?category=cpu&page=0')).body.error.code).toBe('invalid_pagination')
    expect((await errorOf('?q=intel&limit=abc')).body.error.code).toBe('invalid_pagination')
    expect((await errorOf('?q=intel&limit=101')).body.error.code).toBe('invalid_pagination')
  })

  it('treats a query that looks like an operator as text, not as a query', async () => {
    // The punctuation is only a separator, so this is the search for the word "ne" and nothing more.
    expect((await pageOf('?q=%7B%22%24ne%22%3A%22%22%7D')).items).toEqual(
      (await pageOf('?q=ne')).items,
    )
    // A bracketed key is just an unknown parameter for Express' simple query parser, never an object.
    expect((await pageOf('?category[$ne]=cpu')).total).toBe(catalog.length)
  })
})

describe('GET /api/products/:id after the listing gained filters', () => {
  it('still returns one product by its id, whatever the query string says', async () => {
    const id = catalog[0]!.id

    const response = await fetch(
      `${api.url}/api/products/${encodeURIComponent(id)}?q=nothing&brand=nope`,
    )

    expect(response.status).toBe(200)
    expect(((await response.json()) as Product).id).toBe(id)
  })

  it('still answers 404 for an unknown product and 400 for an id it cannot hold', async () => {
    const unknown = await fetch(`${api.url}/api/products/DOES-NOT-EXIST`)
    const invalid = await fetch(`${api.url}/api/products/${encodeURIComponent('a b')}`)

    expect(unknown.status).toBe(404)
    expect(((await unknown.json()) as ErrorBody).error.code).toBe('product_not_found')
    expect(invalid.status).toBe(400)
  })
})
