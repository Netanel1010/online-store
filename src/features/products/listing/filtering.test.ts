import catalog from '../../../../public/data/products.json'
import { makeProduct } from '@/test/fixtures'
import { productsSchema, type Product } from '../schema'
import { deriveFacets, filterProducts, matchesSearch, sortProducts } from './filtering'
import { emptyListingState, toggleBrand, toggleSpecValue, type ListingState } from './query'

const spec = (label: string, value: string) => ({ label, value })

const amdAm5 = makeProduct({
  id: 'AMD-1',
  name: 'AMD Ryzen 7 9700X',
  brand: 'amd',
  category: 'cpu',
  price: { current: 1858 },
  specs: [spec('תושבת מעבד', 'AM5'), spec('תמיכה בזכרון', 'DDR5')],
})
const intelLga1851 = makeProduct({
  id: 'INTEL-1',
  name: 'Intel Core Ultra 7 265',
  brand: 'intel',
  category: 'cpu',
  price: { current: 1785 },
  specs: [spec('תושבת מעבד', 'LGA 1851'), spec('תמיכה בזכרון', 'DDR5')],
})
const intelLga1700 = makeProduct({
  id: 'INTEL-2',
  name: 'Intel Core i9 14900KF',
  brand: 'intel',
  category: 'cpu',
  price: { current: 2069 },
  specs: [spec('תושבת מעבד', 'LGA 1700'), spec('תמיכה בזכרון', 'DDR4')],
})
const intelNoSocket = makeProduct({
  id: 'INTEL-3',
  name: 'Intel Cooler',
  brand: 'intel',
  category: 'cooler',
  price: { current: 100 },
  specs: [],
})
const products = [amdAm5, intelLga1851, intelLga1700, intelNoSocket]

const state = (overrides: Partial<ListingState> = {}): ListingState => ({
  ...emptyListingState,
  ...overrides,
})
const ids = (list: readonly Product[]) => list.map((p) => p.id)

describe('search', () => {
  it('matches every word, case-insensitively, against name, SKU, brand and category', () => {
    expect(matchesSearch(intelLga1851, 'ULTRA')).toBe(true)
    expect(matchesSearch(intelLga1851, 'intel 265')).toBe(true)
    expect(matchesSearch(intelLga1851, 'intel 9700')).toBe(false) // all words must match
    expect(matchesSearch(intelLga1851, 'intel-1')).toBe(true) // SKU
    expect(matchesSearch(intelLga1851, 'מעבדים')).toBe(true) // category label
    expect(matchesSearch(amdAm5, 'AMD')).toBe(true) // brand name
  })

  it('matches everything for an empty or blank query', () => {
    expect(matchesSearch(amdAm5, '')).toBe(true)
    expect(matchesSearch(amdAm5, '   ')).toBe(true)
  })

  it('does not search specification values or features', () => {
    expect(matchesSearch(amdAm5, 'DDR5')).toBe(false)
  })

  it('filters a list by the search text', () => {
    expect(ids(filterProducts(products, state({ q: 'intel' })))).toEqual([
      'INTEL-1',
      'INTEL-2',
      'INTEL-3',
    ])
    expect(filterProducts(products, state({ q: 'nothing like this' }))).toEqual([])
  })
})

describe('filtering semantics', () => {
  it('returns everything without filters', () => {
    expect(filterProducts(products, state())).toHaveLength(4)
  })

  it('ORs values within the brand group', () => {
    const result = filterProducts(products, toggleBrand(toggleBrand(state(), 'amd'), 'intel'))

    expect(ids(result)).toEqual(['AMD-1', 'INTEL-1', 'INTEL-2', 'INTEL-3'])
  })

  it('ORs values within one specification group', () => {
    let query = toggleSpecValue(state(), 'תושבת מעבד', 'AM5')
    query = toggleSpecValue(query, 'תושבת מעבד', 'LGA 1700')

    expect(ids(filterProducts(products, query))).toEqual(['AMD-1', 'INTEL-2'])
  })

  it('ANDs across groups: brand AND specification', () => {
    const query = toggleSpecValue(toggleBrand(state(), 'intel'), 'תושבת מעבד', 'AM5')
    // Intel AND AM5: AM5 belongs to AMD only, so nothing matches.
    expect(filterProducts(products, query)).toEqual([])

    const intelOnLga = toggleSpecValue(toggleBrand(state(), 'intel'), 'תושבת מעבד', 'LGA 1851')
    expect(ids(filterProducts(products, intelOnLga))).toEqual(['INTEL-1'])
  })

  it('ANDs across two specification groups', () => {
    let query = toggleSpecValue(state(), 'תושבת מעבד', 'LGA 1851')
    query = toggleSpecValue(query, 'תמיכה בזכרון', 'DDR4')

    expect(filterProducts(products, query)).toEqual([])

    query = toggleSpecValue(state(), 'תמיכה בזכרון', 'DDR5')
    query = toggleSpecValue(query, 'תושבת מעבד', 'LGA 1851')
    expect(ids(filterProducts(products, query))).toEqual(['INTEL-1'])
  })

  it('excludes products that do not have the selected specification at all', () => {
    const query = toggleSpecValue(state(), 'תושבת מעבד', 'LGA 1700')

    expect(ids(filterProducts(products, query))).not.toContain('INTEL-3')
  })

  it('ANDs the search text with the filters', () => {
    const query = state({ q: 'ultra', brands: ['intel'] })

    expect(ids(filterProducts(products, query))).toEqual(['INTEL-1'])
    expect(filterProducts(products, state({ q: 'ultra', brands: ['amd'] }))).toEqual([])
  })
})

describe('sorting', () => {
  it('keeps the catalog order by default and does not mutate the input', () => {
    const input = [...products]

    expect(ids(sortProducts(input, 'default'))).toEqual(ids(products))
    expect(input).toEqual(products)
  })

  it('sorts by price ascending and descending', () => {
    expect(ids(sortProducts(products, 'price-asc'))).toEqual([
      'INTEL-3',
      'INTEL-1',
      'AMD-1',
      'INTEL-2',
    ])
    expect(ids(sortProducts(products, 'price-desc'))).toEqual([
      'INTEL-2',
      'AMD-1',
      'INTEL-1',
      'INTEL-3',
    ])
  })

  it('sorts by name in both directions', () => {
    expect(ids(sortProducts(products, 'name-asc'))).toEqual([
      'AMD-1',
      'INTEL-3',
      'INTEL-2',
      'INTEL-1',
    ])
    expect(ids(sortProducts(products, 'name-desc'))).toEqual([
      'INTEL-1',
      'INTEL-2',
      'INTEL-3',
      'AMD-1',
    ])
  })

  it('breaks price ties by name', () => {
    const a = makeProduct({ id: 'A', name: 'Alpha', price: { current: 10 } })
    const b = makeProduct({ id: 'B', name: 'Beta', price: { current: 10 } })

    expect(ids(sortProducts([b, a], 'price-asc'))).toEqual(['A', 'B'])
  })
})

describe('deriveFacets', () => {
  const cpus = [amdAm5, intelLga1851, intelLga1700]
  const find = (facets: ReturnType<typeof deriveFacets>, title: string) =>
    facets.find((facet) => facet.title === title)

  it('derives a brand facet from the products, with counts', () => {
    const facets = deriveFacets(cpus, state(), { includeSpecs: false })
    const brand = find(facets, 'מותג')!

    expect(brand.options.map((o) => [o.label, o.count])).toEqual([
      ['AMD', 1],
      ['Intel', 2],
    ])
  })

  it('omits the brand facet when there is nothing to choose between', () => {
    expect(deriveFacets([intelLga1851, intelLga1700], state(), { includeSpecs: false })).toEqual([])
  })

  it('derives specification facets only when requested', () => {
    expect(find(deriveFacets(cpus, state(), { includeSpecs: false }), 'תושבת מעבד')).toBeUndefined()
    expect(find(deriveFacets(cpus, state(), { includeSpecs: true }), 'תושבת מעבד')).toBeDefined()
  })

  it('applies the usefulness rules to specification labels once enough products have them', () => {
    const scope = Array.from({ length: 8 }, (_, index) =>
      makeProduct({
        id: `P${index}`,
        category: 'cpu',
        specs: [
          spec('אחד לכולם', 'X'),
          spec('ייחודי', `unique-${index}`),
          spec('בחירה', index % 2 === 0 ? 'p' : 'q'),
          spec('ארוך', `${'x'.repeat(41)}${index % 2}`),
        ],
      }),
    )
    const titles = deriveFacets(scope, state(), { includeSpecs: true }).map((f) => f.title)

    expect(titles).toContain('בחירה') // two values that repeat
    expect(titles).not.toContain('אחד לכולם') // a single value gives no choice
    expect(titles).not.toContain('ייחודי') // 8 products, 8 different values: hardly repeats
    expect(titles).not.toContain('ארוך') // values too long to be choices
  })

  it('does not apply the repeat rule to small categories, so useful filters stay available', () => {
    const monitors = [
      makeProduct({ id: 'M1', category: 'monitor', specs: [spec('קצב רענון', '165Hz')] }),
      makeProduct({ id: 'M2', category: 'monitor', specs: [spec('קצב רענון', '170Hz')] }),
      makeProduct({ id: 'M3', category: 'monitor', specs: [spec('קצב רענון', '180Hz')] }),
    ]
    const refresh = deriveFacets(monitors, state(), { includeSpecs: true }).find(
      (f) => f.title === 'קצב רענון',
    )

    expect(refresh?.options.map((o) => o.value)).toEqual(['165Hz', '170Hz', '180Hz'])
  })

  it('counts each option against the other groups only (AND across groups)', () => {
    const facets = deriveFacets(cpus, state({ brands: ['intel'] }), { includeSpecs: true })
    const socket = find(facets, 'תושבת מעבד')!
    const count = (value: string) => socket.options.find((o) => o.value === value)?.count

    // With "Intel" ticked, AM5 (AMD only) would give no results; Intel sockets give one each.
    expect(count('AM5')).toBe(0)
    expect(count('LGA 1851')).toBe(1)
    expect(count('LGA 1700')).toBe(1)

    // The brand facet's own counts ignore the brand selection, so AMD is still offered.
    const brand = find(facets, 'מותג')!
    expect(brand.options.find((o) => o.value === 'amd')?.count).toBe(1)
    expect(brand.options.find((o) => o.value === 'intel')?.selected).toBe(true)
  })

  it('narrows the options to the search text', () => {
    const facets = deriveFacets(cpus, state({ q: 'intel' }), { includeSpecs: false })

    expect(find(facets, 'מותג')).toBeUndefined() // only Intel is left in the results
  })

  it('keeps a selected option listed even if the data no longer has it', () => {
    const facets = deriveFacets(cpus, state({ brands: ['samsung'] }), { includeSpecs: false })
    const brand = find(facets, 'מותג')!

    expect(brand.options.find((o) => o.value === 'samsung')).toMatchObject({
      selected: true,
      count: 0,
    })
  })
})

describe('real catalog', () => {
  const parsed = productsSchema.parse(catalog)
  const cpus = parsed.filter((product) => product.category === 'cpu')

  it('derives CPU specification filters from the data and skips unhelpful labels', () => {
    const titles = deriveFacets(cpus, state(), { includeSpecs: true }).map((f) => f.title)

    expect(titles).toContain('מותג')
    expect(titles).toContain('תושבת מעבד')
    expect(titles).toContain('תמיכה בזכרון')
    expect(titles).not.toContain('גרסת PCI Express') // every CPU has the same value
    expect(titles).not.toContain('מהירות שעון בסיסית') // values hardly repeat
  })

  it('has option counts that add up to the products that have the label', () => {
    const facets = deriveFacets(cpus, state(), { includeSpecs: true })
    const socket = facets.find((f) => f.title === 'תושבת מעבד')!
    const withSocket = cpus.filter((p) => p.specs.some((s) => s.label === 'תושבת מעבד')).length

    expect(socket.options.reduce((sum, o) => sum + o.count, 0)).toBe(withSocket)
  })

  it('combines a real brand and socket filter with AND semantics', () => {
    const intel1851 = toggleSpecValue(toggleBrand(state(), 'intel'), 'תושבת מעבד', 'LGA 1851')
    const result = filterProducts(cpus, intel1851)

    expect(result.length).toBeGreaterThan(0)
    for (const product of result) {
      expect(product.brand).toBe('intel')
      expect(product.specs).toContainEqual(spec('תושבת מעבד', 'LGA 1851'))
    }
    expect(
      filterProducts(cpus, toggleSpecValue(toggleBrand(state(), 'amd'), 'תושבת מעבד', 'LGA 1851')),
    ).toEqual([])
  })
})
