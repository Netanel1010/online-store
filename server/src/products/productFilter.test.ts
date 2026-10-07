import { describe, expect, it } from 'vitest'
import { searchScore } from '../../../src/features/products/listing/search.ts'
import { matchesFilter } from '../testing/mongoFilter.ts'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import { toMongoFilter, toMongoSort } from './productFilter.ts'
import { buildSearchFields } from './searchFields.ts'
import { validateCatalog } from './seed.ts'
import type { Product, ProductFilter } from './types.ts'

const catalog = validateCatalog(readSourceCatalog())
const stored = catalog.map((product) => ({ ...product, search: buildSearchFields(product) }))

const filterOf = (overrides: Partial<ProductFilter> = {}): ProductFilter => ({
  brands: [],
  specs: new Map(),
  ...overrides,
})
const idsOf = (filter: ProductFilter) =>
  stored.filter((document) => matchesFilter(document, toMongoFilter(filter))).map((p) => p.id)
const expectedIds = (keep: (product: Product) => boolean) =>
  catalog.filter(keep).map((product) => product.id)

describe('toMongoFilter', () => {
  it('is no condition at all when nothing is selected', () => {
    expect(toMongoFilter(filterOf())).toEqual({})
    expect(idsOf(filterOf())).toEqual(catalog.map((product) => product.id))
  })

  it('asks for the category and the brands as plain equalities', () => {
    expect(toMongoFilter(filterOf({ category: 'cpu', brands: ['amd', 'intel'] }))).toEqual({
      $and: [{ category: 'cpu' }, { brand: { $in: ['amd', 'intel'] } }],
    })
  })

  it('asks every selected specification label for one of its values, exactly', () => {
    const filter = toMongoFilter(
      filterOf({
        specs: new Map([
          ['תושבת מעבד', ['AM5', 'LGA 1700']],
          ['x.y', ['a+b']],
        ]),
      }),
    ) as { $and: { specs: { $elemMatch: Record<string, { $regex: string }> } }[] }

    expect(filter.$and).toHaveLength(2)
    expect(filter.$and[0]?.specs.$elemMatch.label?.$regex).toBe('^(?:תושבת מעבד)(?![\\s\\S])')
    expect(filter.$and[0]?.specs.$elemMatch.value?.$regex).toBe('^(?:AM5|LGA 1700)(?![\\s\\S])')
    // Characters with a meaning in a pattern are taken literally.
    expect(filter.$and[1]?.specs.$elemMatch.label?.$regex).toBe('^(?:x\\.y)(?![\\s\\S])')
    expect(filter.$and[1]?.specs.$elemMatch.value?.$regex).toBe('^(?:a\\+b)(?![\\s\\S])')
  })

  it('skips a label without values and a search without words', () => {
    expect(
      toMongoFilter(
        filterOf({ specs: new Map([['x', []]]), search: { query: ' -- ', deep: false } }),
      ),
    ).toEqual({})
  })

  it('selects the products with these ids, and only those that exist', () => {
    const wanted = [catalog[3]!.id, catalog[0]!.id, 'NOT-IN-THE-CATALOG']

    expect(toMongoFilter(filterOf({ ids: wanted }))).toEqual({
      $and: [{ id: { $in: wanted } }],
    })
    expect(idsOf(filterOf({ ids: wanted })).sort()).toEqual([catalog[0]!.id, catalog[3]!.id].sort())
  })

  it('selects no product for an empty list of ids, which is not the same as no list', () => {
    expect(idsOf(filterOf({ ids: [] }))).toEqual([])
    expect(idsOf(filterOf({}))).toHaveLength(catalog.length)
  })

  it('treats an id that looks like a query as plain text', () => {
    expect(idsOf(filterOf({ ids: ['$ne', '{"$gt":""}'] }))).toEqual([])
  })

  it('selects the products on sale: those with an original price', () => {
    const onSale = idsOf(filterOf({ onSale: true }))

    expect(onSale).toEqual(expectedIds((product) => product.price.original !== undefined))
    expect(onSale.length).toBeGreaterThan(0)
    expect(onSale.length).toBeLessThan(catalog.length)
  })

  it('selects the recommended products', () => {
    const recommended = idsOf(filterOf({ recommended: true }))

    expect(recommended).toEqual(expectedIds((product) => product.isRecommended))
    expect(recommended.length).toBeGreaterThan(0)
    expect(recommended.length).toBeLessThan(catalog.length)
  })

  it('needs every part to hold: the ids, the sale and the category together', () => {
    const everyId = catalog.map((product) => product.id)

    expect(idsOf(filterOf({ ids: everyId, onSale: true, category: 'gpu' }))).toEqual(
      expectedIds((product) => product.price.original !== undefined && product.category === 'gpu'),
    )
  })

  it('selects the products of a category', () => {
    expect(idsOf(filterOf({ category: 'gpu' }))).toEqual(
      expectedIds((product) => product.category === 'gpu'),
    )
  })

  it('selects the products of any of the brands', () => {
    expect(idsOf(filterOf({ brands: ['amd', 'intel'] }))).toEqual(
      expectedIds((product) => product.brand === 'amd' || product.brand === 'intel'),
    )
  })

  it('selects products by a specification value, and by any of several', () => {
    const socket = (value: string) => (product: Product) =>
      product.specs.some((spec) => spec.label === 'תושבת מעבד' && spec.value === value)

    expect(idsOf(filterOf({ specs: new Map([['תושבת מעבד', ['AM5']]]) }))).toEqual(
      expectedIds(socket('AM5')),
    )
    const either = idsOf(filterOf({ specs: new Map([['תושבת מעבד', ['AM5', 'LGA 1851']]]) }))
    expect(either).toEqual(
      expectedIds((product) => socket('AM5')(product) || socket('LGA 1851')(product)),
    )
    expect(either.length).toBeGreaterThan(1)
  })

  it('needs every selected label to have one of its values', () => {
    const both = idsOf(
      filterOf({
        specs: new Map([
          ['תושבת מעבד', ['AM5']],
          ['תמיכה בזכרון', ['DDR5']],
        ]),
      }),
    )

    expect(both).toEqual(
      expectedIds(
        (product) =>
          product.specs.some((spec) => spec.label === 'תושבת מעבד' && spec.value === 'AM5') &&
          product.specs.some((spec) => spec.label === 'תמיכה בזכרון' && spec.value === 'DDR5'),
      ),
    )
  })

  it('does not take a part of a value, a different case or a pattern for the value', () => {
    for (const value of ['AM', 'am5', 'AM5 ', 'AM5\n', 'A.5', '.*', 'AM5|LGA 1851']) {
      expect(idsOf(filterOf({ specs: new Map([['תושבת מעבד', [value]]]) })), value).toEqual([])
    }
    expect(idsOf(filterOf({ specs: new Map([['תושבת .*', ['AM5']]]) }))).toEqual([])
  })

  it('does not take 08GB for 8GB: values are compared as text, not as numbers', () => {
    const products = [
      { ...makeProduct({ id: 'A-1', specs: [{ label: 'זיכרון', value: '8GB' }] }) },
      { ...makeProduct({ id: 'A-2', specs: [{ label: 'זיכרון', value: '08GB' }] }) },
    ].map((product) => ({ ...product, search: buildSearchFields(product) }))
    const filter = toMongoFilter(filterOf({ specs: new Map([['זיכרון', ['8GB']]]) }))

    expect(products.filter((product) => matchesFilter(product, filter)).map((p) => p.id)).toEqual([
      'A-1',
    ])
  })

  it('searches with the same result as the storefront search, core and deep', () => {
    for (const deep of [false, true]) {
      for (const query of ['intel', 'rtx 4070', 'ddr5', '7800x3d', 'מעבדים', 'nothing like it']) {
        expect(idsOf(filterOf({ search: { query, deep } })), `${query} ${deep}`).toEqual(
          expectedIds((product) => searchScore(product, query, { deep }) > 0),
        )
      }
    }
  })

  it('combines the category, the brands, the search and the specifications', () => {
    const filter = filterOf({
      category: 'cpu',
      brands: ['intel'],
      search: { query: 'core', deep: false },
      specs: new Map([['תמיכה בזכרון', ['DDR5']]]),
    })

    expect(idsOf(filter)).toEqual(
      expectedIds(
        (product) =>
          product.category === 'cpu' &&
          product.brand === 'intel' &&
          searchScore(product, 'core') > 0 &&
          product.specs.some((spec) => spec.label === 'תמיכה בזכרון' && spec.value === 'DDR5'),
      ),
    )
    expect(idsOf(filter).length).toBeGreaterThan(0)
  })
})

describe('toMongoSort', () => {
  it('is by id without a sort, and ends every other sort with the id', () => {
    expect(toMongoSort('default')).toEqual({ id: 1 })
    expect(toMongoSort('price-asc')).toEqual({ 'price.current': 1, name: 1, id: 1 })
    expect(toMongoSort('price-desc')).toEqual({ 'price.current': -1, name: 1, id: 1 })
    expect(toMongoSort('name-asc')).toEqual({ name: 1, id: 1 })
    expect(toMongoSort('name-desc')).toEqual({ name: -1, id: 1 })
  })

  it('keeps the order of its keys, which is the order of the comparison', () => {
    expect(Object.keys(toMongoSort('price-desc'))).toEqual(['price.current', 'name', 'id'])
  })
})
