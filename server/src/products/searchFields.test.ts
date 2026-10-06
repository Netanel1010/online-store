import { describe, expect, it } from 'vitest'
import {
  searchScore,
  searchTexts,
  searchWords,
} from '../../../src/features/products/listing/search.ts'
import { readSourceCatalog } from '../testing/products.ts'
import { makeProduct } from '../testing/products.ts'
import { validateCatalog } from './seed.ts'
import { buildSearchFields, escapeRegExp, SEARCH_VERSION, searchFilter } from './searchFields.ts'

const catalog = validateCatalog(readSourceCatalog())

/**
 * Evaluates the few operators `searchFilter` uses against a stored product, the way MongoDB does:
 * `$and`, `$or` and `$regex` on a field of the stored `search` object.
 */
function matches(document: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and')
      return (condition as Record<string, unknown>[]).every((f) => matches(document, f))
    if (key === '$or')
      return (condition as Record<string, unknown>[]).some((f) => matches(document, f))
    const value = key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], document)
    const { $regex } = condition as { $regex: string }
    return typeof value === 'string' && new RegExp($regex, 'u').test(value)
  })
}

const stored = catalog.map((product) => ({
  product,
  document: { search: buildSearchFields(product) },
}))

describe('buildSearchFields', () => {
  it('stores the normalized text of every searchable field, and the version of the format', () => {
    const product = makeProduct({
      id: 'GV-N4070GAMING',
      name: 'Gigabyte GeForce RTX™ 4070',
      specs: [{ label: 'זיכרון', value: '12GB GDDR6X' }],
      features: ['DLSS 3'],
    })

    expect(buildSearchFields(product)).toEqual({
      v: SEARCH_VERSION,
      name: expect.stringContaining('gigabyte geforce rtx 4070'),
      sku: 'gv n4070gaming',
      brand: 'gigabyte gigabyte',
      category: expect.stringContaining('gpu'),
      specs: '12gb gddr6x',
      features: 'dlss 3',
    })
  })

  it('is exactly what the search in the storefront reads', () => {
    for (const product of catalog) {
      expect(buildSearchFields(product)).toMatchObject({
        v: SEARCH_VERSION,
        ...searchTexts(product),
      })
    }
  })
})

describe('escapeRegExp', () => {
  it('makes every regular expression character literal', () => {
    const text = '.*+?^${}()|[]\\'

    expect(new RegExp(`^${escapeRegExp(text)}$`).test(text)).toBe(true)
    expect(new RegExp(`^${escapeRegExp(text)}$`).test('anything')).toBe(false)
  })
})

describe('searchFilter', () => {
  it('is no condition for an empty or blank search', () => {
    expect(searchFilter('', false)).toEqual({})
    expect(searchFilter('  -- ', true)).toEqual({})
  })

  it('asks for every word, each in any of the core fields', () => {
    expect(searchFilter('intel 265', false)).toEqual({
      $and: [
        {
          $or: ['name', 'sku', 'brand', 'category'].map((field) => ({
            [`search.${field}`]: { $regex: 'intel' },
          })),
        },
        {
          $or: ['name', 'sku', 'brand', 'category'].map((field) => ({
            [`search.${field}`]: { $regex: '265' },
          })),
        },
      ],
    })
  })

  it('also looks at the specifications and features when asked to go deep', () => {
    const filter = searchFilter('ddr5', true) as { $and: { $or: Record<string, unknown>[] }[] }

    expect(filter.$and[0]?.$or.map((condition) => Object.keys(condition)[0])).toEqual([
      'search.name',
      'search.sku',
      'search.brand',
      'search.category',
      'search.specs',
      'search.features',
    ])
  })

  it('matches a word of one or two characters only at the start of a word', () => {
    const filter = searchFilter('i7', false) as { $and: { $or: Record<string, unknown>[] }[] }

    expect(filter.$and[0]?.$or[0]).toEqual({ 'search.name': { $regex: '(^| )i7' } })
  })

  it('lets a single longer word match across a space, like "rtx4070" in "rtx 4070"', () => {
    const filter = searchFilter('rtx4070', false) as { $and: { $or: Record<string, unknown>[] }[] }

    expect(filter.$and[0]?.$or[0]).toEqual({ 'search.name': { $regex: 'r ?t ?x ?4 ?0 ?7 ?0' } })
  })

  it('does not do that for a word of three characters, or for several words', () => {
    const three = searchFilter('rtx', false) as { $and: { $or: Record<string, unknown>[] }[] }
    const several = searchFilter('rtx4070 gigabyte', false) as {
      $and: { $or: Record<string, unknown>[] }[]
    }

    expect(three.$and[0]?.$or[0]).toEqual({ 'search.name': { $regex: 'rtx' } })
    expect(several.$and[0]?.$or[0]).toEqual({ 'search.name': { $regex: 'rtx4070' } })
  })

  it('never puts the typed text into a pattern as it is', () => {
    const filter = searchFilter('.* (a+)+$ [x] \\ | ?', false) as {
      $and: { $or: { 'search.name': { $regex: string } }[] }[]
    }

    // Punctuation is only a separator: what is left is the two words, and nothing else.
    expect(filter.$and.map((word) => word.$or[0]?.['search.name'].$regex)).toEqual([
      '(^| )a',
      '(^| )x',
    ])
  })

  it('uses at most as many words as the storefront does', () => {
    const filter = searchFilter('a1 b2 c3 d4 e5 f6 g7 h8 i9 j10', false) as { $and: unknown[] }

    expect(filter.$and).toHaveLength(8)
  })

  // The filter is a pattern per word. Run against every product of the real catalog, it has to
  // select exactly the products the storefront's search selects (searchScore), core and deep.
  const queries = [
    'RTX 4070',
    'rtx4070',
    'Rtx   4070',
    'rtx-4070',
    '4070',
    '5070',
    '7800X3D',
    '7800',
    'x3d',
    '7800 x3d',
    'ryzen 7 7800x3d',
    'GV-N4070GAMING',
    'gv n4070 gaming',
    'gpp650g',
    'GP-P650G',
    'intel',
    'INTEL',
    'amd',
    'asus',
    'gigabyte',
    'gpu',
    'כרטיסי מסך',
    'מעבדים',
    'intel 265',
    'intel 9700',
    'gigabyte 4070',
    'amd 7600x tray',
    'i7',
    'i9',
    'wifi7',
    'wifi',
    'ddr5',
    'ddr4',
    'geforce rtx 4070',
    'nvidia 4070',
    'dlss',
    'am5',
    'a',
    'ab',
    'c',
    'x',
    '7',
    'zzzz',
    'מק"ט',
    '"',
    '()[]',
    'a b c',
    'gv',
    'cooler master',
    'h',
  ]

  it.each([false, true])(
    'selects the same products as the storefront search (deep: %s)',
    (deep) => {
      for (const query of queries) {
        const expected = stored
          .filter(
            ({ product }) =>
              searchWords(query).length === 0 || searchScore(product, query, { deep }) > 0,
          )
          .map(({ product }) => product.id)
        const actual = stored
          .filter(({ document }) => matches(document, searchFilter(query, deep)))
          .map(({ product }) => product.id)

        expect(actual, `"${query}" (deep: ${deep})`).toEqual(expected)
      }
    },
  )

  it('finds something for a good share of the queries, so the comparison above is not empty', () => {
    const found = queries.filter((query) =>
      stored.some(({ document }) => matches(document, searchFilter(query, true))),
    )

    expect(found.length).toBeGreaterThan(30)
  })
})
