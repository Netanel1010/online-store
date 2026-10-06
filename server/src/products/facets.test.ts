import { describe, expect, it } from 'vitest'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import {
  offeredSpecGroups,
  sanitizeSpecSelection,
  SPEC_FACET_RULES,
  type FacetCounts,
  buildFacets,
} from './facets.ts'
import { validateCatalog } from './seed.ts'
import type { Product, SpecValueCount } from './types.ts'

const spec = (label: string, value: string) => ({ label, value })
const SOCKET = 'תושבת מעבד'

const none = { brands: [], specs: new Map<string, string[]>() }
const valuesOf = async (products: Product[]): Promise<SpecValueCount[]> =>
  createMemoryProductRepository(products).repository.specValueCounts(none)

const labelsOffered = async (products: Product[]) =>
  offeredSpecGroups(await valuesOf(products)).map((group) => group.label)

describe('offeredSpecGroups', () => {
  it('applies the usefulness rules once enough products have the label', async () => {
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
    const labels = await labelsOffered(scope)

    expect(labels).toContain('בחירה') // two values that repeat
    expect(labels).not.toContain('אחד לכולם') // a single value gives no choice
    expect(labels).not.toContain('ייחודי') // 8 products, 8 different values: hardly repeats
    expect(labels).not.toContain('ארוך') // values too long to be choices
  })

  it('does not apply the repeat rule to small categories, so useful filters stay available', async () => {
    const monitors = [
      makeProduct({ id: 'M1', category: 'monitor', specs: [spec('קצב רענון', '165Hz')] }),
      makeProduct({ id: 'M2', category: 'monitor', specs: [spec('קצב רענון', '170Hz')] }),
      makeProduct({ id: 'M3', category: 'monitor', specs: [spec('קצב רענון', '180Hz')] }),
    ]

    expect(offeredSpecGroups(await valuesOf(monitors))).toEqual([
      { label: 'קצב רענון', values: ['165Hz', '170Hz', '180Hz'] },
    ])
  })

  it('needs at least two products and two different values, and at most ten values', async () => {
    const rules = SPEC_FACET_RULES
    const many = Array.from({ length: rules.maxValues + 1 }, (_, index) =>
      makeProduct({
        id: `V${index}`,
        specs: [spec('הרבה', `v${index % 11}`), spec('חצי', `h${index % 2}`)],
      }),
    )
    const single = [makeProduct({ id: 'S1', specs: [spec('יחיד', 'a')] })]

    expect(await labelsOffered(many)).toEqual(['חצי']) // 11 values are too many
    expect(await labelsOffered(single)).toEqual([])
  })

  it('lists the groups and their values in alphabetical order, numbers as numbers', async () => {
    const products = [
      makeProduct({ id: 'A', specs: [spec('ב', '10GB'), spec('א', 'y')] }),
      makeProduct({ id: 'B', specs: [spec('ב', '2GB'), spec('א', 'x')] }),
    ]

    expect(offeredSpecGroups(await valuesOf(products))).toEqual([
      { label: 'א', values: ['x', 'y'] },
      { label: 'ב', values: ['2GB', '10GB'] },
    ])
  })
})

describe('sanitizeSpecSelection', () => {
  const offered = [{ label: SOCKET, values: ['AM5', 'LGA 1700'] }]

  it('keeps what is offered exactly as it is', () => {
    const selection = new Map([[SOCKET, ['AM5', 'LGA 1700']]])

    expect(sanitizeSpecSelection(selection, offered)).toEqual(selection)
  })

  it('drops an unknown label, an unknown value, and a label that is not offered', () => {
    const selection = new Map([
      [SOCKET, ['AM5', 'Nope']],
      ['fake', ['x']],
      ['משהו', ['y']],
    ])

    expect([...sanitizeSpecSelection(selection, offered)]).toEqual([[SOCKET, ['AM5']]])
  })

  it('is empty when nothing is offered', () => {
    expect(sanitizeSpecSelection(new Map([[SOCKET, ['AM5']]]), []).size).toBe(0)
  })

  it('does not take Object.prototype keys for labels', () => {
    expect(sanitizeSpecSelection(new Map([['__proto__', ['x']]]), offered).size).toBe(0)
  })
})

describe('buildFacets', () => {
  const counts = (overrides: Partial<FacetCounts> = {}): FacetCounts => ({
    scopeBrands: [],
    brandCounts: [],
    scopeSpecs: [],
    specCountsFor: () => [],
    ...overrides,
  })

  it('has no brand group for a single brand, unless a brand is selected', () => {
    const single = counts({
      scopeBrands: [{ brand: 'intel', count: 4 }],
      brandCounts: [{ brand: 'intel', count: 4 }],
    })

    expect(buildFacets(single, { brands: [] }, { includeSpecs: false }).brands).toEqual([])
    expect(buildFacets(single, { brands: ['intel'] }, { includeSpecs: false }).brands).toEqual([
      { value: 'intel', count: 4 },
    ])
  })

  it('sorts the brands by their display name and gives a brand without products a zero', () => {
    const facets = buildFacets(
      counts({
        scopeBrands: [
          { brand: 'intel', count: 2 },
          { brand: 'amd', count: 1 },
          { brand: 'asus', count: 1 },
        ],
        brandCounts: [{ brand: 'intel', count: 2 }],
      }),
      { brands: [] },
      { includeSpecs: false },
    )

    expect(facets.brands).toEqual([
      { value: 'amd', count: 0 },
      { value: 'asus', count: 0 },
      { value: 'intel', count: 2 },
    ])
  })

  it('has no specification groups unless they are asked for', () => {
    const withSpecs = counts({
      scopeSpecs: [
        { label: 'x', value: 'a', count: 2 },
        { label: 'x', value: 'b', count: 2 },
      ],
    })

    expect(buildFacets(withSpecs, { brands: [] }, { includeSpecs: false }).specs).toEqual([])
    expect(buildFacets(withSpecs, { brands: [] }, { includeSpecs: true }).specs).toEqual([
      {
        label: 'x',
        options: [
          { value: 'a', count: 0 },
          { value: 'b', count: 0 },
        ],
      },
    ])
  })
})

describe('the real catalog', () => {
  const catalog = validateCatalog(readSourceCatalog())
  const cpus = catalog.filter((product) => product.category === 'cpu')

  it('offers the CPU filters that help, and leaves out the ones that do not', async () => {
    const labels = await labelsOffered(cpus)

    expect(labels).toContain(SOCKET)
    expect(labels).toContain('תמיכה בזכרון')
    expect(labels).not.toContain('גרסת PCI Express') // every CPU has the same value
    expect(labels).not.toContain('מהירות שעון בסיסית') // values hardly repeat
  })

  it('has option counts that add up to the products that have the label', async () => {
    const socket = (await valuesOf(cpus)).filter((count) => count.label === SOCKET)
    const withSocket = cpus.filter((product) => product.specs.some((s) => s.label === SOCKET))

    expect(socket.reduce((sum, count) => sum + count.count, 0)).toBe(withSocket.length)
  })
})
