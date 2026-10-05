import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createDatabase, type Database } from '../db/database.ts'
import { listen } from '../testing/listen.ts'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import { createProductRepository } from './repository.ts'
import { seedProducts, validateCatalog } from './seed.ts'
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
    const { items, total } = await repository.list({ skip: 5, limit: 10 })

    expect(total).toBe(31)
    expect(items.map((item) => item.id)).toEqual(sortedIds.slice(5, 15))
    for (const item of items) expect(item).not.toHaveProperty('_id')
  })

  it('finds a product by its id, and answers null for one that does not exist', async () => {
    expect(await repository.findById(catalog[2]!.id)).toEqual(catalog[2])
    expect(await repository.findById('DOES-NOT-EXIST')).toBeNull()
  })

  it('treats an id that looks like a query as plain text', async () => {
    expect(await repository.findById('{"$ne":""}')).toBeNull()
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
})
