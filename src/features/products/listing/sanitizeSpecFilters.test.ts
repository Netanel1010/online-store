import { makeProduct } from '@/test/fixtures'
import type { Product } from '../schema'
import { filterProducts, sanitizeSpecFilters } from './filtering'
import { emptyListingState, type ListingState } from './query'

const spec = (label: string, value: string) => ({ label, value })
const SOCKET = 'תושבת מעבד'
const MEMORY = 'תמיכה בזכרון'

const amd = makeProduct({
  id: 'AMD-1',
  brand: 'amd',
  category: 'cpu',
  specs: [spec(SOCKET, 'AM5'), spec(MEMORY, 'DDR5')],
})
const intelNew = makeProduct({
  id: 'INTEL-1',
  brand: 'intel',
  category: 'cpu',
  specs: [spec(SOCKET, 'LGA 1851'), spec(MEMORY, 'DDR5')],
})
const intelOld = makeProduct({
  id: 'INTEL-2',
  brand: 'intel',
  category: 'cpu',
  specs: [spec(SOCKET, 'LGA 1700'), spec(MEMORY, 'DDR4')],
})
const cpus = [amd, intelNew, intelOld]

const withSpecs = (...entries: [string, string[]][]): ListingState => ({
  ...emptyListingState,
  specs: new Map(entries),
})
const sanitize = (query: ListingState, includeSpecs = true) =>
  sanitizeSpecFilters(cpus, query, { includeSpecs })
const ids = (list: readonly Product[]) => list.map((product) => product.id)

describe('sanitizeSpecFilters', () => {
  it('ignores an unknown specification label, so it can no longer empty the results', () => {
    const query = withSpecs(['fake', ['value']], ['משהו_שלא_קיים', ['abc']])

    const result = sanitize(query)

    expect(result.specs.size).toBe(0)
    expect(filterProducts(cpus, query)).toEqual([]) // what the bug did
    expect(filterProducts(cpus, result)).toHaveLength(3)
  })

  it('ignores an unknown value of a known label', () => {
    const result = sanitize(withSpecs([SOCKET, ['Nope']]))

    expect(result.specs.size).toBe(0)
    expect(filterProducts(cpus, result)).toHaveLength(3)
  })

  it('keeps a valid label and value exactly as it is', () => {
    const query = withSpecs([SOCKET, ['AM5', 'LGA 1700']])

    const result = sanitize(query)

    expect(result).toBe(query) // nothing was dropped, so the same object comes back
    expect(ids(filterProducts(cpus, result))).toEqual(['AMD-1', 'INTEL-2'])
  })

  it('keeps only the valid parts of mixed valid and invalid parameters', () => {
    const query = withSpecs(
      [SOCKET, ['AM5', 'Nope']], // one valid value, one unknown value
      ['fake', ['value']], // unknown label
      [MEMORY, ['Nope']], // known label with only unknown values
    )

    const result = sanitize(query)

    expect([...result.specs]).toEqual([[SOCKET, ['AM5']]])
    expect(ids(filterProducts(cpus, result))).toEqual(['AMD-1'])
  })

  it('does not change anything else in the state', () => {
    const query: ListingState = {
      q: 'amd',
      brands: ['amd'],
      sort: 'price-desc',
      specs: new Map([['fake', ['value']]]),
    }

    expect(sanitize(query)).toEqual({ ...query, specs: new Map() })
  })

  it('drops every specification filter where none are offered', () => {
    expect(sanitize(withSpecs([SOCKET, ['AM5']]), false).specs.size).toBe(0)
  })

  it('ignores a label that exists in the data but is not offered as a filter', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      makeProduct({
        id: `P${index}`,
        category: 'cpu',
        specs: [spec('ייחודי', `v${index}`), spec('בחירה', index % 2 ? 'p' : 'q')],
      }),
    )
    const query = withSpecs(['ייחודי', ['v1']], ['בחירה', ['p']])

    const result = sanitizeSpecFilters(many, query, { includeSpecs: true })

    expect([...result.specs]).toEqual([['בחירה', ['p']]])
  })

  it('returns the state untouched when there are no specification filters', () => {
    const query: ListingState = { ...emptyListingState, brands: ['amd'] }

    expect(sanitize(query)).toBe(query)
  })
})
