import { describe, expect, it, vi } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import { createMemoryProductRepository } from '../testing/memoryProductRepository.ts'
import { makeProduct, readSourceCatalog } from '../testing/products.ts'
import { validateCatalog } from './seed.ts'
import { createProductService } from './service.ts'

const spec = (label: string, value: string) => ({ label, value })
const SOCKET = 'תושבת מעבד'
const MEMORY = 'תמיכה בזכרון'

// A small catalog whose answers can be checked by hand: three CPUs and a cooler.
const amdAm5 = makeProduct({
  id: 'AMD-1',
  name: 'AMD Ryzen 7 9700X',
  brand: 'amd',
  category: 'cpu',
  price: { current: 1858 },
  specs: [spec(SOCKET, 'AM5'), spec(MEMORY, 'DDR5')],
})
const intelNew = makeProduct({
  id: 'INTEL-1',
  name: 'Intel Core Ultra 7 265',
  brand: 'intel',
  category: 'cpu',
  price: { current: 1785 },
  specs: [spec(SOCKET, 'LGA 1851'), spec(MEMORY, 'DDR5')],
})
const intelOld = makeProduct({
  id: 'INTEL-2',
  name: 'Intel Core i9 14900KF',
  brand: 'intel',
  category: 'cpu',
  price: { current: 2069 },
  specs: [spec(SOCKET, 'LGA 1700'), spec(MEMORY, 'DDR4')],
})
const cooler = makeProduct({
  id: 'COOL-1',
  name: 'Cooler Master Hyper',
  brand: 'cooler-master',
  category: 'cooler',
  price: { current: 100 },
  specs: [],
})
const small = [amdAm5, intelNew, intelOld, cooler]

const serviceOver = (products: Parameters<typeof createMemoryProductRepository>[0]) =>
  createProductService(createMemoryProductRepository(products).repository)
const ids = (page: { items: { id: string }[] }) => page.items.map((item) => item.id)
const withSpecs = (...entries: [string, string[]][]) => new Map(entries)

describe('a plain listing', () => {
  it('is every product by id, with no filter options unless they are asked for', async () => {
    const page = await serviceOver(small).list()

    expect(ids(page)).toEqual(['AMD-1', 'COOL-1', 'INTEL-1', 'INTEL-2'])
    expect(page).toEqual({
      items: expect.any(Array),
      page: 1,
      limit: 20,
      total: 4,
      totalPages: 1,
    })
    expect(page).not.toHaveProperty('facets')
  })
})

describe('the category filter', () => {
  it('lists only the products of that category', async () => {
    const page = await serviceOver(small).list({ category: 'cpu' })

    expect(ids(page)).toEqual(['AMD-1', 'INTEL-1', 'INTEL-2'])
    expect(page.total).toBe(3)
  })

  it('is empty, not an error, for a category without products', async () => {
    const page = await serviceOver(small).list({ category: 'headset' })

    expect(page).toEqual({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 })
  })
})

describe('the brand filter', () => {
  it('lists the products of one brand', async () => {
    expect(ids(await serviceOver(small).list({ brands: ['intel'] }))).toEqual([
      'INTEL-1',
      'INTEL-2',
    ])
  })

  it('lists the products of any of several brands', async () => {
    expect(ids(await serviceOver(small).list({ brands: ['amd', 'cooler-master'] }))).toEqual([
      'AMD-1',
      'COOL-1',
    ])
  })

  it('combines with the category', async () => {
    const service = serviceOver(small)

    expect(ids(await service.list({ category: 'cpu', brands: ['cooler-master'] }))).toEqual([])
    expect(ids(await service.list({ category: 'cpu', brands: ['amd'] }))).toEqual(['AMD-1'])
  })
})

describe('the specification filters', () => {
  const cpus = (specs: Map<string, string[]>) => serviceOver(small).list({ category: 'cpu', specs })

  it('lists the products that have the selected value', async () => {
    expect(ids(await cpus(withSpecs([SOCKET, ['LGA 1851']])))).toEqual(['INTEL-1'])
  })

  it('lists the products that have any of the selected values of one label', async () => {
    expect(ids(await cpus(withSpecs([SOCKET, ['AM5', 'LGA 1700']])))).toEqual(['AMD-1', 'INTEL-2'])
  })

  it('needs every selected label to match', async () => {
    expect(
      ids(await cpus(withSpecs([MEMORY, ['DDR5']], [SOCKET, ['LGA 1851', 'LGA 1700']]))),
    ).toEqual(['INTEL-1'])
  })

  it('combines with the brands', async () => {
    const page = await serviceOver(small).list({
      category: 'cpu',
      brands: ['intel'],
      specs: withSpecs([MEMORY, ['DDR5']]),
    })

    expect(ids(page)).toEqual(['INTEL-1'])
  })

  it('ignores a label that does not exist, instead of returning nothing', async () => {
    expect(ids(await cpus(withSpecs(['fake', ['value']])))).toHaveLength(3)
  })

  it('ignores a value that does not exist for a label that does', async () => {
    expect(ids(await cpus(withSpecs([SOCKET, ['Nope']])))).toHaveLength(3)
  })

  it('keeps the valid parts of a mixed selection', async () => {
    const page = await cpus(
      withSpecs([SOCKET, ['AM5', 'Nope']], [MEMORY, ['Nope']], ['fake', ['x']]),
    )

    expect(ids(page)).toEqual(['AMD-1'])
  })

  it('ignores them all without a category: there is no scope to offer them in', async () => {
    const page = await serviceOver(small).list({ specs: withSpecs([SOCKET, ['AM5']]) })

    expect(page.total).toBe(4)
  })

  it('ignores a label that is not offered as a filter because its values hardly repeat', async () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      makeProduct({
        id: `MANY-${index}`,
        category: 'cpu',
        specs: [spec('מחיר אחרון', `unique-${index}`), spec('בחירה', index % 2 ? 'p' : 'q')],
      }),
    )

    const page = await serviceOver(many).list({
      category: 'cpu',
      specs: withSpecs(['מחיר אחרון', ['unique-1']]),
    })

    expect(page.total).toBe(6)
  })
})

describe('the search', () => {
  const real = validateCatalog(readSourceCatalog())
  const service = serviceOver(real)
  const find = async (q: string, more: Parameters<typeof service.list>[0] = {}) =>
    ids(await service.list({ q, limit: 100, ...more }))

  it('finds a model by its number, however it is written', async () => {
    for (const q of ['RTX 4070', 'rtx 4070', 'Rtx   4070', 'rtx-4070', 'rtx4070', ' 4070 ']) {
      expect(await find(q), q).toEqual(['N4070GAMINGOCV212GD'])
    }
  })

  it('finds a model by a part of its number or its SKU', async () => {
    expect(await find('x3d')).toEqual(['100-000000910'])
    expect(await find('gv-n4070gaming')).toEqual(['N4070GAMINGOCV212GD'])
    expect(await find('gpp650g')).toEqual(['GP-P650G'])
  })

  it('finds products by brand and by category, in Hebrew too', async () => {
    expect(await find('asus')).toEqual(['90MB1CX0-M1EAY0'])
    const gpus = real.filter((product) => product.category === 'gpu').map((p) => p.id)
    expect((await find('כרטיסי מסך')).sort()).toEqual(gpus.sort())
  })

  it('needs every word to match', async () => {
    expect(await find('gigabyte 4070')).toEqual(['N4070GAMINGOCV212GD'])
    expect(await find('intel 9700')).toEqual([])
  })

  it('looks at the specifications only when the name, SKU, brand and category match nothing', async () => {
    // "intel" matches by name, so the boards that merely support Intel sockets are not listed.
    const intel = await find('intel')
    expect(intel.sort()).toEqual(
      real
        .filter((product) => product.brand === 'intel')
        .map((product) => product.id)
        .sort(),
    )
    // "ddr5" is in no name, so the specifications and features are read.
    expect((await find('ddr5')).length).toBeGreaterThan(0)
  })

  it('is empty, not an error, when nothing matches', async () => {
    const page = await service.list({ q: 'zzzz' })

    expect(page).toEqual({ items: [], page: 1, limit: 20, total: 0, totalPages: 0 })
  })

  it('treats a text with no letters or digits as no search', async () => {
    expect((await service.list({ q: ' -- ' })).total).toBe(31)
  })

  it('lists the best matches first when there is no sort', async () => {
    // By id the second product would come first; by match the one named like the search does.
    const named = makeProduct({ id: 'Z-1', name: 'Gigabyte RTX 4070', category: 'gpu' })
    const bySku = makeProduct({
      id: 'A-4070',
      name: 'Some other card',
      fullName: 'Some other card',
      category: 'gpu',
    })

    const page = await serviceOver([bySku, named]).list({ q: '4070' })

    expect(ids(page)).toEqual(['Z-1', 'A-4070'])
  })

  it('lists the products in the order of the sort when there is one', async () => {
    const named = makeProduct({ id: 'Z-1', name: 'Gigabyte RTX 4070', category: 'gpu' })
    const bySku = makeProduct({
      id: 'A-4070',
      name: 'Some other card',
      fullName: 'Some other card',
      category: 'gpu',
    })

    const page = await serviceOver([bySku, named]).list({ q: '4070', sort: 'name-desc' })

    expect(ids(page)).toEqual(['A-4070', 'Z-1'])
  })

  it('combines with the category and the brands', async () => {
    expect(await find('intel', { category: 'cpu', brands: ['intel'] })).toEqual(
      real
        .filter((product) => product.brand === 'intel' && product.category === 'cpu')
        .map((product) => product.id)
        .sort(),
    )
    expect(await find('intel', { brands: ['amd'] })).toEqual([])
  })

  it('does not change where it looks when a brand is ticked', async () => {
    // Nothing matches "ddr5" by name, so the search reads the specifications; ticking a brand that
    // has no match must give no products, not widen the search.
    const all = await find('ddr5')
    expect(all.length).toBeGreaterThan(0)
    expect(await find('ddr5', { brands: ['samsung'] })).toEqual(
      real
        .filter((product) => all.includes(product.id) && product.brand === 'samsung')
        .map((product) => product.id)
        .sort(),
    )
  })

  it('pages the ranked results, without losing or repeating a product', async () => {
    const first = await service.list({ q: 'intel', limit: 3, page: 1 })
    const second = await service.list({ q: 'intel', limit: 3, page: 2 })
    const everything = await service.list({ q: 'intel', limit: 100 })

    expect([...ids(first), ...ids(second)]).toEqual(ids(everything).slice(0, 6))
    expect(first).toMatchObject({
      total: everything.total,
      totalPages: Math.ceil(everything.total / 3),
    })
  })
})

describe('the sort', () => {
  const real = validateCatalog(readSourceCatalog())
  const service = serviceOver(real)
  const byName = (a: string, b: string) => a.localeCompare(b, 'he', { numeric: true })

  it('is by id without a sort', async () => {
    expect(ids(await service.list({ limit: 100 }))).toEqual(real.map((p) => p.id).sort())
  })

  it('by price, cheapest first, and the most expensive first', async () => {
    const asc = await service.list({ sort: 'price-asc', limit: 100 })
    const desc = await service.list({ sort: 'price-desc', limit: 100 })

    expect(asc.items.map((p) => p.price.current)).toEqual(
      [...real.map((p) => p.price.current)].sort((a, b) => a - b),
    )
    expect(desc.items.map((p) => p.price.current)).toEqual(
      [...real.map((p) => p.price.current)].sort((a, b) => b - a),
    )
  })

  it('by name, in Hebrew order with numbers as numbers', async () => {
    const asc = await service.list({ sort: 'name-asc', limit: 100 })
    const desc = await service.list({ sort: 'name-desc', limit: 100 })

    expect(asc.items.map((p) => p.name)).toEqual(real.map((p) => p.name).sort(byName))
    expect(desc.items.map((p) => p.name)).toEqual(
      real
        .map((p) => p.name)
        .sort(byName)
        .reverse(),
    )
  })

  it('breaks ties of the price by name', async () => {
    const b = makeProduct({ id: 'B-1', name: 'Bravo', price: { current: 500 } })
    const a = makeProduct({ id: 'C-1', name: 'Alpha', price: { current: 500 } })

    expect(ids(await serviceOver([b, a]).list({ sort: 'price-asc' }))).toEqual(['C-1', 'B-1'])
  })

  it('applies to the filtered products, and pages them in that order', async () => {
    const cpus = real.filter((product) => product.category === 'cpu')
    const expected = cpus.map((p) => p.price.current).sort((a, b) => a - b)

    const first = await service.list({ category: 'cpu', sort: 'price-asc', limit: 5, page: 1 })
    const second = await service.list({ category: 'cpu', sort: 'price-asc', limit: 5, page: 2 })

    expect([...first.items, ...second.items].map((p) => p.price.current)).toEqual(
      expected.slice(0, 10),
    )
    expect(first).toMatchObject({ total: cpus.length, totalPages: Math.ceil(cpus.length / 5) })
  })
})

describe('paging a filtered listing', () => {
  const real = validateCatalog(readSourceCatalog())
  const service = serviceOver(real)
  const cpuIds = real
    .filter((product) => product.category === 'cpu')
    .map((p) => p.id)
    .sort()

  it('counts the products that match, not the whole catalog', async () => {
    const page = await service.list({ category: 'cpu', limit: 4 })

    expect(page).toMatchObject({ total: cpuIds.length, totalPages: Math.ceil(cpuIds.length / 4) })
    expect(ids(page)).toEqual(cpuIds.slice(0, 4))
  })

  it('has no overlap between the pages, and together they are the matches once', async () => {
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      seen.push(...ids(await service.list({ category: 'cpu', limit: 4, page })))
    }

    expect(seen).toEqual(cpuIds)
  })

  it('is empty past the end, with the real total', async () => {
    const page = await service.list({ category: 'cpu', limit: 4, page: 99 })

    expect(page).toMatchObject({ items: [], page: 99, total: cpuIds.length })
  })

  it('still rejects a page that is not allowed, before it asks for anything', async () => {
    const repository = createMemoryProductRepository(real).repository
    const count = vi.spyOn(repository, 'count')
    const failure = await createProductService(repository)
      .list({ q: 'intel', page: 0 })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(HttpError)
    expect(failure).toMatchObject({ status: 400, code: 'invalid_pagination' })
    expect(count).not.toHaveBeenCalled()
  })
})

describe('the filter options (facets)', () => {
  const cpus = (params: Parameters<ReturnType<typeof serviceOver>['list']>[0] = {}) =>
    serviceOver(small).list({ category: 'cpu', facets: true, ...params })

  it('lists the brands of the scope with their counts, sorted by name', async () => {
    const { facets } = await cpus()

    expect(facets?.brands).toEqual([
      { value: 'amd', count: 1 },
      { value: 'intel', count: 2 },
    ])
  })

  it('offers no brand group when there is no choice, unless a brand is ticked', async () => {
    const onlyIntel = serviceOver([intelNew, intelOld])

    expect((await onlyIntel.list({ category: 'cpu', facets: true })).facets?.brands).toEqual([])
    expect(
      (await onlyIntel.list({ category: 'cpu', facets: true, brands: ['intel'] })).facets?.brands,
    ).toEqual([{ value: 'intel', count: 2 }])
  })

  it('lists a ticked brand that the scope has none of, so it can be unticked', async () => {
    const { facets } = await cpus({ brands: ['samsung'] })

    expect(facets?.brands).toContainEqual({ value: 'samsung', count: 0 })
  })

  it('counts a brand as if it were ticked: the other groups apply, its own does not', async () => {
    const { facets } = await cpus({ brands: ['amd'], specs: withSpecs([MEMORY, ['DDR5']]) })

    // DDR5 is selected: one AMD and one Intel have it. The brand selection is not applied.
    expect(facets?.brands).toEqual([
      { value: 'amd', count: 1 },
      { value: 'intel', count: 1 },
    ])
  })

  it('offers the specification groups that are worth a filter, with counts', async () => {
    const { facets } = await cpus()

    // The groups are in the alphabetical order of their labels, and the options of each group too.
    expect(facets?.specs).toEqual([
      {
        label: SOCKET,
        options: [
          { value: 'AM5', count: 1 },
          { value: 'LGA 1700', count: 1 },
          { value: 'LGA 1851', count: 1 },
        ],
      },
      {
        label: MEMORY,
        options: [
          { value: 'DDR4', count: 1 },
          { value: 'DDR5', count: 2 },
        ],
      },
    ])
  })

  it('counts a specification option with the brands and the other labels, not its own label', async () => {
    const { facets } = await cpus({ brands: ['intel'], specs: withSpecs([SOCKET, ['LGA 1851']]) })

    const memory = facets?.specs.find((group) => group.label === MEMORY)
    const socket = facets?.specs.find((group) => group.label === SOCKET)
    // Memory options count the Intel products that also have the selected socket.
    expect(memory?.options).toEqual([
      { value: 'DDR4', count: 0 },
      { value: 'DDR5', count: 1 },
    ])
    // Socket options count the Intel products, without the socket selection itself.
    expect(socket?.options).toEqual([
      { value: 'AM5', count: 0 },
      { value: 'LGA 1700', count: 1 },
      { value: 'LGA 1851', count: 1 },
    ])
  })

  it('offers specification groups only within a category', async () => {
    const { facets } = await serviceOver(small).list({ facets: true })

    expect(facets?.specs).toEqual([])
    expect(facets?.brands.map((option) => option.value)).toEqual(['amd', 'cooler-master', 'intel'])
  })

  it('does not offer the values the selection ignored', async () => {
    const { facets, total } = await cpus({ specs: withSpecs([SOCKET, ['Nope']]) })

    expect(total).toBe(3)
    expect(facets?.specs.find((group) => group.label === SOCKET)?.options).toHaveLength(3)
  })

  it('follows the search text: the options are those of the matching products', async () => {
    const everything = await serviceOver(small).list({ facets: true })
    const searched = await serviceOver(small).list({ q: 'core', facets: true })

    expect(everything.facets?.brands).toHaveLength(3)
    // Only Intel products have "core" in their name, so there is no choice between brands left.
    expect(searched.total).toBe(2)
    expect(searched.facets?.brands).toEqual([])
  })

  it('has nothing to offer in an empty scope', async () => {
    const { facets, total } = await serviceOver(small).list({ category: 'headset', facets: true })

    expect(total).toBe(0)
    expect(facets).toEqual({ brands: [], specs: [] })
  })
})

describe('ProductService.list: a lookup, the sale and the recommended products', () => {
  const sale = makeProduct({
    id: 'SALE-1',
    name: 'On sale',
    brand: 'amd',
    category: 'gpu',
    price: { current: 700, original: 900 },
    isRecommended: false,
  })
  const pick = makeProduct({
    id: 'PICK-1',
    name: 'Our pick',
    category: 'gpu',
    price: { current: 800 },
    isRecommended: true,
  })
  const both = makeProduct({
    id: 'BOTH-1',
    name: 'Both',
    brand: 'intel',
    category: 'cpu',
    price: { current: 500, original: 600 },
    isRecommended: true,
  })
  const plainOne = makeProduct({
    id: 'PLAIN-1',
    name: 'Plain',
    category: 'cpu',
    price: { current: 400 },
    isRecommended: false,
  })
  const shop = [sale, pick, both, plainOne]
  const idsOf = async (params: Parameters<ReturnType<typeof serviceOver>['list']>[0]) =>
    (await serviceOver(shop).list(params)).items.map((product) => product.id)

  it('looks up the products with the given ids, and leaves out an id that has no product', async () => {
    expect(await idsOf({ ids: ['PICK-1', 'MISSING-1', 'PLAIN-1'] })).toEqual(['PICK-1', 'PLAIN-1'])
  })

  it('counts the lookup like any listing: total, page and limit', async () => {
    const page = await serviceOver(shop).list({ ids: ['SALE-1', 'PICK-1', 'BOTH-1'], limit: 2 })

    expect(page).toMatchObject({ total: 3, totalPages: 2, limit: 2 })
    expect(page.items).toHaveLength(2)
  })

  it('lists only the products on sale', async () => {
    expect(await idsOf({ sale: true })).toEqual(['BOTH-1', 'SALE-1'])
  })

  it('lists only the recommended products', async () => {
    expect(await idsOf({ recommended: true })).toEqual(['BOTH-1', 'PICK-1'])
  })

  it('needs every restriction to hold, with the category and the search too', async () => {
    expect(await idsOf({ sale: true, recommended: true })).toEqual(['BOTH-1'])
    expect(await idsOf({ sale: true, category: 'gpu' })).toEqual(['SALE-1'])
    expect(await idsOf({ ids: ['SALE-1', 'PLAIN-1'], sale: true })).toEqual(['SALE-1'])
    expect(await idsOf({ ids: ['SALE-1', 'PLAIN-1'], q: 'plain' })).toEqual(['PLAIN-1'])
  })

  it('restricts the filter options to the same products', async () => {
    const { facets } = await serviceOver(shop).list({ sale: true, facets: true })

    // Two products are on sale, one of each brand: the options count only those.
    expect(facets?.brands.map((option) => option.count)).toEqual([1, 1])
  })

  it('is the whole catalog when none of them is given', async () => {
    expect(await idsOf({})).toHaveLength(4)
    expect(await idsOf({ ids: [], sale: false, recommended: false })).toHaveLength(4)
  })
})

describe('ProductService.categoryCounts', () => {
  it('counts the products per category, in the order of the category registry', async () => {
    const counts = await serviceOver([cooler, amdAm5, intelNew, intelOld]).categoryCounts()

    expect(counts).toEqual([
      { category: 'cpu', count: 3 },
      { category: 'cooler', count: 1 },
    ])
  })

  it('has no entry for a category without products, and none at all for an empty catalog', async () => {
    expect(await serviceOver([]).categoryCounts()).toEqual([])
  })

  it('counts the real catalog: every product is in one category', async () => {
    const real = validateCatalog(readSourceCatalog())
    const counts = await serviceOver(real).categoryCounts()

    expect(counts.reduce((sum, entry) => sum + entry.count, 0)).toBe(real.length)
  })
})
