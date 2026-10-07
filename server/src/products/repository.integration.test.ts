import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createDatabase, type Database } from '../db/database.ts'
import { listen } from '../testing/listen.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import { createProductRepository } from './repository.ts'
import { buildSearchFields, SEARCH_VERSION } from './searchFields.ts'
import { seedProducts, validateCatalog } from './seed.ts'
import { createProductService } from './service.ts'
import type { Product, ProductPage } from './types.ts'

// Optional: runs only when MONGODB_TEST_URI points at a real MongoDB (local or Atlas), for example
//   MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:server
// Without it the tests are skipped, so ordinary runs and CI need no database. They work in a
// database of their own with a random name and drop it at the end; they never use MONGODB_URI.
// The tests build on each other, in the order they are written.
const uri = process.env.MONGODB_TEST_URI

describe.skipIf(!uri)('products on a real MongoDB (integration, needs MONGODB_TEST_URI)', () => {
  const catalog = validateCatalog(readSourceCatalog())
  const sortedIds = catalog.map((product) => product.id).sort()

  // Created in beforeAll: the body of a skipped describe still runs, and there is no URI then.
  let database: Database
  let repository: ReturnType<typeof createProductRepository>
  let api: Awaited<ReturnType<typeof listen>>
  const rawProducts = () => database.db().collection('products')

  beforeAll(async () => {
    const dbName = `online_store_test_${randomUUID().slice(0, 8)}`
    database = createDatabase({ uri: uri!, dbName, connectTimeoutMs: 10_000 })
    await database.connect()
    repository = createProductRepository(database)
    api = await listen(createApp({ corsOrigins: [] }, undefined, database))
  })

  afterAll(async () => {
    await api.close()
    await database.db().dropDatabase()
    await database.close()
  })

  it('creates the unique index on id, and creating it again changes nothing', async () => {
    await repository.ensureIndexes()
    await repository.ensureIndexes()

    const indexes = await rawProducts().listIndexes().toArray()
    expect(indexes.map((index) => index.name).sort()).toEqual(['_id_', 'id_unique'])
    expect(indexes.find((index) => index.name === 'id_unique')).toMatchObject({
      key: { id: 1 },
      unique: true,
    })
  })

  it('seeds the whole catalog, and seeding again changes and adds nothing', async () => {
    const first = await seedProducts(repository, catalog)
    const second = await seedProducts(repository, catalog)

    expect(first).toEqual({ inserted: 31, updated: 0, unchanged: 0, total: 31, notInSource: 0 })
    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 31, total: 31, notInSource: 0 })
    expect(await rawProducts().countDocuments()).toBe(31)
  })

  it('stores the product as it is, with the internal _id apart from the product id', async () => {
    const stored = await rawProducts().findOne({ id: catalog[0]!.id })

    expect(stored).toMatchObject(catalog[0]!)
    expect(stored?._id).toBeDefined()
  })

  it('updates a changed product in place: same document, no new one', async () => {
    const target = catalog[0]!
    const before = await rawProducts().findOne({ id: target.id })
    const changed = catalog.map((product) =>
      product.id === target.id
        ? { ...product, price: { ...product.price, current: product.price.current + 111 } }
        : product,
    )

    const summary = await seedProducts(repository, changed)

    expect(summary).toMatchObject({ inserted: 0, updated: 1, unchanged: 30 })
    expect(await rawProducts().countDocuments()).toBe(31)
    const after = await rawProducts().findOne({ id: target.id })
    expect(after?._id).toEqual(before?._id)
    expect((after as unknown as Product).price.current).toBe(target.price.current + 111)
    // Put the catalog back.
    expect(await seedProducts(repository, catalog)).toMatchObject({ updated: 1, unchanged: 30 })
  })

  it('refuses a second product with the same id at the database level', async () => {
    const duplicate = rawProducts().insertOne({ ...catalog[0]! })

    await expect(duplicate).rejects.toMatchObject({ code: 11000 })
    expect(await rawProducts().countDocuments()).toBe(31)
  })

  it('leaves other documents alone, and does not delete products that left the source', async () => {
    const extra = makeProduct({ id: 'ONLY-IN-DB' })
    await rawProducts().insertOne({ ...extra })
    const unrelated = { note: 'not a product', _id: 'unrelated' as unknown as never }
    await rawProducts().insertOne(unrelated)

    const summary = await seedProducts(repository, catalog)

    expect(summary).toMatchObject({ inserted: 0, updated: 0, unchanged: 31, notInSource: 2 })
    expect(await rawProducts().findOne({ id: 'ONLY-IN-DB' })).toMatchObject(extra)
    expect(await rawProducts().findOne({ _id: 'unrelated' as unknown as never })).toMatchObject({
      note: 'not a product',
    })

    await rawProducts().deleteOne({ _id: 'unrelated' as unknown as never })
    await rawProducts().deleteOne({ id: 'ONLY-IN-DB' })
  })

  it('lists one page in the order of id, with the total, and without _id', async () => {
    const { items, total } = await repository.list(
      { brands: [], specs: new Map() },
      { sort: 'default', skip: 5, limit: 10 },
    )

    expect(total).toBe(31)
    expect(items.map((item) => item.id)).toEqual(sortedIds.slice(5, 15))
    for (const item of items) expect(item).not.toHaveProperty('_id')
  })

  it('finds a product by its id, and answers null for one that does not exist', async () => {
    expect(await repository.findById(catalog[2]!.id)).toEqual(catalog[2])
    expect(await repository.findById('DOES-NOT-EXIST')).toBeNull()
  })

  it('finds several products by their ids in one query, leaving out an id with no product', async () => {
    const found = await repository.findByIds([catalog[0]!.id, 'DOES-NOT-EXIST', catalog[3]!.id])

    expect(found.map((product) => product.id).sort()).toEqual(
      [catalog[0]!.id, catalog[3]!.id].sort(),
    )
    for (const product of found) {
      expect(product).not.toHaveProperty('_id')
      expect(product).not.toHaveProperty('search')
    }
    expect(await repository.findByIds([])).toEqual([])
  })

  it('treats an id that looks like a query as plain text', async () => {
    expect(await repository.findById('{"$ne":""}')).toBeNull()
    expect(await repository.findByIds(['{"$ne":""}'])).toEqual([])
  })

  it('serves the products over HTTP from MongoDB', async () => {
    const page = (await (
      await fetch(`${api.url}/api/products?page=2&limit=10`)
    ).json()) as ProductPage
    const one = await fetch(`${api.url}/api/products/${encodeURIComponent(catalog[1]!.id)}`)
    const missing = await fetch(`${api.url}/api/products/DOES-NOT-EXIST`)

    expect(page).toMatchObject({ page: 2, limit: 10, total: 31, totalPages: 4 })
    expect(page.items.map((item) => item.id)).toEqual(sortedIds.slice(10, 20))
    expect(one.status).toBe(200)
    expect(await one.json()).toEqual(catalog[1])
    expect(missing.status).toBe(404)
  })
  it('stores the search text with every product, and leaves it out of what it returns', async () => {
    const stored = await rawProducts().findOne({ id: catalog[0]!.id })

    expect(stored?.search).toEqual(buildSearchFields(catalog[0]!))
    expect(await repository.findById(catalog[0]!.id)).not.toHaveProperty('search')
  })

  it('writes the search text again for products that have none, and only for them', async () => {
    await rawProducts().updateMany({}, { $unset: { search: '' } })

    expect(await repository.ensureSearchFields()).toBe(31)
    expect(await repository.ensureSearchFields()).toBe(0)
    expect(await rawProducts().countDocuments({ 'search.v': SEARCH_VERSION })).toBe(31)
  })

  it('writes the search text again for products stored with an older version', async () => {
    await rawProducts().updateOne({ id: catalog[3]!.id }, { $set: { 'search.v': 0 } })

    expect(await repository.ensureSearchFields()).toBe(1)
    expect(await rawProducts().countDocuments({ 'search.v': SEARCH_VERSION })).toBe(31)
  })

  // The API over MongoDB has to answer exactly like the API over the in-memory repository, which
  // is what the rest of the tests (and the storefront's tests) run against. The two are compared
  // over the real catalog: searches, filters, sorts, pages and the filter options.
  describe('answers like the in-memory repository', () => {
    const scenarios: [string, Parameters<ReturnType<typeof createProductService>['list']>[0]][] = [
      ['a plain listing', {}],
      ['a page', { page: 2, limit: 7 }],
      ['a category', { category: 'cpu', facets: true, limit: 100 }],
      ['brands', { brands: ['amd', 'intel'], facets: true, limit: 100 }],
      ['a search', { q: 'rtx 4070', facets: true }],
      ['a search written without a space', { q: 'rtx4070' }],
      ['a search by a part of a model', { q: 'x3d' }],
      ['a search by brand', { q: 'intel', facets: true, limit: 100 }],
      ['a search in Hebrew', { q: 'כרטיסי מסך', limit: 100 }],
      ['a search that has to read the specifications', { q: 'ddr5', facets: true, limit: 100 }],
      ['a search that finds nothing', { q: 'zzzz', facets: true }],
      ['a search with a sort', { q: 'intel', sort: 'price-asc', limit: 100 }],
      ['a search with a brand', { q: 'intel', brands: ['intel'], limit: 100 }],
      ['price, cheapest first', { sort: 'price-asc', limit: 100 }],
      ['price, most expensive first', { sort: 'price-desc', limit: 100 }],
      ['name, ascending', { sort: 'name-asc', limit: 100 }],
      ['name, descending', { sort: 'name-desc', limit: 100 }],
      [
        'a specification',
        { category: 'cpu', specs: new Map([['תושבת מעבד', ['AM5']]]), facets: true, limit: 100 },
      ],
      [
        'specifications, a brand and a sort',
        {
          category: 'cpu',
          brands: ['intel'],
          specs: new Map([['תמיכה בזכרון', ['DDR5']]]),
          sort: 'name-asc',
          facets: true,
          limit: 100,
        },
      ],
      ['a lookup by id', { ids: [catalog[0]!.id, catalog[4]!.id, 'DOES-NOT-EXIST'], limit: 100 }],
      ['the products on sale', { sale: true, limit: 100, facets: true }],
      ['the recommended products', { recommended: true, limit: 100 }],
      ['the sale and the recommended together', { sale: true, recommended: true, limit: 100 }],
      ['the sale in a category, sorted', { sale: true, category: 'gpu', sort: 'price-asc' }],
      ['a search among the products on sale', { sale: true, q: 'rtx', limit: 100 }],
      [
        'a specification that does not exist',
        { category: 'cpu', specs: new Map([['fake', ['x']]]), limit: 100 },
      ],
    ]

    it.each(scenarios)('%s', async (_name, params) => {
      const expected = await createProductService(
        createMemoryProductRepository(catalog).repository,
      ).list(params)

      const actual = await createProductService(repository).list(params)

      expect(actual).toEqual(expected)
    })
  })

  it('counts the products of each category like the in-memory repository does', async () => {
    const expected = await createProductService(
      createMemoryProductRepository(catalog).repository,
    ).categoryCounts()

    const actual = await createProductService(repository).categoryCounts()

    expect(actual).toEqual(expected)
    expect(actual.reduce((sum, entry) => sum + entry.count, 0)).toBe(catalog.length)
  })

  it('serves the lookup, the sale and the category counts over HTTP from MongoDB', async () => {
    const wanted = [catalog[2]!.id, catalog[7]!.id]
    const lookup = (await (
      await fetch(`${api.url}/api/products?ids=${wanted.join(',')}&limit=100`)
    ).json()) as ProductPage
    const sale = (await (
      await fetch(`${api.url}/api/products?sale=true&limit=100`)
    ).json()) as ProductPage
    const counts = (await (await fetch(`${api.url}/api/categories`)).json()) as {
      items: { id: string; count: number }[]
    }
    const empty = await fetch(`${api.url}/api/products?ids=`)

    expect(lookup.items.map((product) => product.id).sort()).toEqual([...wanted].sort())
    expect(sale.total).toBe(
      catalog.filter((product) => product.price.original !== undefined).length,
    )
    expect(counts.items.reduce((sum, entry) => sum + entry.count, 0)).toBe(catalog.length)
    expect(empty.status).toBe(400)
  })

  it('treats a search text as text: a pattern in it matches nothing special', async () => {
    const service = createProductService(repository)

    for (const q of ['.*', '(a+)+$', '[a-z]', '\\', '$ne', '{"$ne":""}']) {
      const mongo = await service.list({ q, limit: 100 })
      const memory = await createProductService(
        createMemoryProductRepository(catalog).repository,
      ).list({ q, limit: 100 })

      expect(mongo, q).toEqual(memory)
    }
  })

  it('does not take 08GB for 8GB when it filters by a specification and sorts by name', async () => {
    const odd = [
      makeProduct({
        id: 'ODD-1',
        category: 'memory',
        name: 'Odd one',
        specs: [{ label: 'x', value: '8GB' }],
      }),
      makeProduct({
        id: 'ODD-2',
        category: 'memory',
        name: 'Odd two',
        specs: [{ label: 'x', value: '08GB' }],
      }),
      makeProduct({
        id: 'ODD-3',
        category: 'memory',
        name: 'Odd three',
        specs: [{ label: 'x', value: '16GB' }],
      }),
    ]
    await seedProducts(repository, [...catalog, ...odd])

    const page = await createProductService(repository).list({
      category: 'memory',
      specs: new Map([['x', ['8GB']]]),
      sort: 'name-asc',
      limit: 100,
    })

    expect(page.items.map((item) => item.id)).toEqual(['ODD-1'])
    for (const product of odd) await rawProducts().deleteOne({ id: product.id })
  })

  it('serves a search, filters and a sort over HTTP from MongoDB', async () => {
    const page = (await (
      await fetch(
        `${api.url}/api/products?q=intel&category=cpu&brand=intel&sort=price-asc&facets=true&limit=100`,
      )
    ).json()) as ProductPage
    const invalid = await fetch(`${api.url}/api/products?sort=nope`)

    expect(page.total).toBeGreaterThan(0)
    expect(page.facets).toBeDefined()
    for (const item of page.items) expect(item.brand).toBe('intel')
    expect(page.items.map((i) => i.price.current)).toEqual(
      page.items.map((i) => i.price.current).sort((a, b) => a - b),
    )
    expect(invalid.status).toBe(400)
  })
})
