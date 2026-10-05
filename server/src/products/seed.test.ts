import { describe, expect, it } from 'vitest'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import { formatSeedSummary, seedProducts, SeedValidationError, validateCatalog } from './seed.ts'

const issuesOf = (source: unknown) => {
  try {
    validateCatalog(source)
  } catch (error) {
    expect(error).toBeInstanceOf(SeedValidationError)
    return (error as SeedValidationError).issues
  }
  throw new Error('the catalog was accepted')
}

describe('validateCatalog', () => {
  it('accepts the real catalog: 31 products, all of them valid', () => {
    const products = validateCatalog(readSourceCatalog())

    expect(products).toHaveLength(31)
    expect(new Set(products.map((product) => product.id)).size).toBe(31)
  })

  it('does not change the data it validates', () => {
    const source = readSourceCatalog()
    const before = JSON.stringify(source)

    validateCatalog(source)

    expect(JSON.stringify(source)).toBe(before)
  })

  it('rejects data that is not a list', () => {
    expect(issuesOf({ products: [] })).toHaveLength(1)
    expect(issuesOf('nope')).toHaveLength(1)
    expect(issuesOf(null)).toHaveLength(1)
  })

  it('rejects an empty catalog', () => {
    expect(issuesOf([])).toEqual(['(catalog): the catalog has no products'])
  })

  it('says which product and which field is wrong', () => {
    const issues = issuesOf([
      makeProduct({ id: 'A-1' }),
      makeProduct({ id: 'B-2', price: { current: -1 } }),
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatch(/^1\.price\.current: /)
  })

  it('rejects a product with a missing field, an unknown category or a bad URL', () => {
    const withoutName = Object.fromEntries(
      Object.entries(makeProduct()).filter(([key]) => key !== 'name'),
    )

    expect(issuesOf([withoutName])[0]).toMatch(/^0\.name: /)
    expect(issuesOf([{ ...makeProduct(), category: 'toaster' }])[0]).toMatch(/^0\.category: /)
    expect(issuesOf([{ ...makeProduct(), manufacturerUrl: 'ftp://x' }])[0]).toMatch(
      /^0\.manufacturerUrl: /,
    )
  })

  it('rejects two products with the same id', () => {
    const issues = issuesOf([makeProduct({ id: 'A-1' }), makeProduct({ id: 'A-1' })])

    expect(issues.join('\n')).toMatch(/duplicate product id "A-1"/)
  })

  it('rejects an id the API could not serve', () => {
    const issues = issuesOf([makeProduct({ id: 'has space' })])

    expect(issues[0]).toMatch(/^0\.id: product id "has space" cannot be used in the API/)
  })

  it('reports every problem, up to a limit, and says how many more there are', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      makeProduct({ id: `P-${index}`, price: { current: -1 } }),
    )

    const issues = issuesOf(many)

    expect(issues).toHaveLength(21)
    expect(issues.at(-1)).toBe('... and 10 more')
  })
})

describe('seedProducts', () => {
  const catalog = validateCatalog(readSourceCatalog())

  it('inserts every product into an empty collection', async () => {
    const { repository, stored } = createMemoryProductRepository()

    const summary = await seedProducts(repository, catalog)

    expect(summary).toEqual({ inserted: 31, updated: 0, unchanged: 0, total: 31, notInSource: 0 })
    expect(stored.size).toBe(31)
  })

  it('creates the index before it writes', async () => {
    const { repository, calls } = createMemoryProductRepository()

    await seedProducts(repository, catalog)

    expect(calls).toEqual(['ensureIndexes', 'upsertMany'])
  })

  it('does nothing the second time: same result, no duplicates', async () => {
    const { repository, stored } = createMemoryProductRepository()
    await seedProducts(repository, catalog)

    const second = await seedProducts(repository, catalog)

    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 31, total: 31, notInSource: 0 })
    expect(stored.size).toBe(31)
  })

  it('updates a product that changed in the source instead of adding another', async () => {
    const { repository, stored } = createMemoryProductRepository()
    await seedProducts(repository, catalog)
    const changed = catalog.map((product, index) =>
      index === 0
        ? { ...product, price: { ...product.price, current: product.price.current + 100 } }
        : product,
    )

    const summary = await seedProducts(repository, changed)

    expect(summary).toEqual({ inserted: 0, updated: 1, unchanged: 30, total: 31, notInSource: 0 })
    expect(stored.size).toBe(31)
    expect(stored.get(catalog[0]!.id)?.price.current).toBe(catalog[0]!.price.current + 100)
  })

  it('inserts a new product and updates nothing else', async () => {
    const { repository, stored } = createMemoryProductRepository()
    await seedProducts(repository, catalog)

    const summary = await seedProducts(repository, [...catalog, makeProduct({ id: 'NEW-1' })])

    expect(summary).toMatchObject({ inserted: 1, updated: 0, unchanged: 31, total: 32 })
    expect(stored.size).toBe(32)
  })

  it('leaves products that are not in the source exactly as they are, and counts them', async () => {
    const extra = makeProduct({ id: 'ONLY-IN-DB' })
    const { repository, stored } = createMemoryProductRepository([extra])

    const summary = await seedProducts(repository, catalog)

    expect(summary).toMatchObject({ inserted: 31, notInSource: 1 })
    expect(stored.get('ONLY-IN-DB')).toEqual(extra)
    expect(stored.size).toBe(32)
  })

  it('does not touch a product that has the same id as another, only that one', async () => {
    const other = makeProduct({ id: 'OTHER' })
    const { repository, stored } = createMemoryProductRepository([other])

    await seedProducts(repository, [makeProduct({ id: 'MINE' })])

    expect(stored.get('OTHER')).toEqual(other)
  })
})

describe('formatSeedSummary', () => {
  it('prints what the run did', () => {
    expect(
      formatSeedSummary({ inserted: 31, updated: 0, unchanged: 0, total: 31, notInSource: 0 }),
    ).toBe(
      [
        'Products seed completed',
        'Inserted: 31',
        'Updated: 0',
        'Unchanged: 0',
        'Total source products: 31',
        'Not in source (left untouched): 0',
      ].join('\n'),
    )
  })
})
