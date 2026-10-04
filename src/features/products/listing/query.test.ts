import {
  clearFilters,
  countActiveFilters,
  emptyListingState,
  parseListingState,
  serializeListingState,
  setSort,
  toggleBrand,
  toggleSpecValue,
  type ListingState,
} from './query'

const parse = (search: string, options?: { search?: boolean }) =>
  parseListingState(new URLSearchParams(search), options)

describe('parseListingState', () => {
  it('returns the empty state for an empty URL', () => {
    expect(parse('')).toEqual(emptyListingState)
  })

  it('reads the search text, brands, specification filters and sort', () => {
    const state = parse(
      `q=${encodeURIComponent('  intel core ')}&brand=intel&brand=amd&sort=price-asc` +
        `&${encodeURIComponent('s.תושבת מעבד')}=AM5&${encodeURIComponent('s.תושבת מעבד')}=LGA%201700`,
    )

    expect(state.q).toBe('intel core')
    expect(state.brands).toEqual(['amd', 'intel']) // canonical order, not URL order
    expect(state.specs.get('תושבת מעבד')).toEqual(['AM5', 'LGA 1700'])
    expect(state.sort).toBe('price-asc')
  })

  it('ignores unknown brands, unknown sorts and empty spec parts', () => {
    const state = parse('brand=nope&brand=intel&sort=chaos&s.=x&s.label=&other=1')

    expect(state.brands).toEqual(['intel'])
    expect(state.sort).toBe('default')
    expect(state.specs.size).toBe(0)
  })

  it('removes duplicate values', () => {
    const state = parse('brand=intel&brand=intel&s.a=1&s.a=1')

    expect(state.brands).toEqual(['intel'])
    expect(state.specs.get('a')).toEqual(['1'])
  })

  it('can ignore the search text for pages that have no search', () => {
    expect(parse('q=intel', { search: false }).q).toBe('')
  })

  it('truncates absurdly long search text', () => {
    expect(parse(`q=${'a'.repeat(500)}`).q).toHaveLength(100)
  })

  it('is safe against prototype-polluting spec labels', () => {
    const state = parse('s.__proto__=x&s.constructor=y')

    expect(state.specs.get('__proto__')).toEqual(['x'])
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})

describe('serializeListingState', () => {
  it('produces an empty string for the default state (a clean URL)', () => {
    expect(serializeListingState(emptyListingState).toString()).toBe('')
  })

  it('is canonical: click order does not change the URL', () => {
    const a = toggleSpecValue(toggleBrand(toggleBrand(emptyListingState, 'intel'), 'amd'), 'x', '2')
    const b = toggleSpecValue(toggleBrand(toggleBrand(emptyListingState, 'amd'), 'intel'), 'x', '2')

    expect(serializeListingState(a).toString()).toBe(serializeListingState(b).toString())
  })

  it('round-trips a full state, including Hebrew labels and values with separators', () => {
    let state: ListingState = { ...emptyListingState, q: 'מעבד intel', sort: 'name-desc' }
    state = toggleBrand(state, 'asus')
    state = toggleSpecValue(state, 'חיבורים', 'HDMI | DisplayPort & USB=C')
    state = toggleSpecValue(state, 'חיבורים', 'USB')

    const parsed = parseListingState(serializeListingState(state))

    expect(parsed.q).toBe('מעבד intel')
    expect(parsed.sort).toBe('name-desc')
    expect(parsed.brands).toEqual(['asus'])
    expect(parsed.specs.get('חיבורים')).toEqual(['HDMI | DisplayPort & USB=C', 'USB'])
  })

  it('omits the search text when the page has no search', () => {
    const state: ListingState = { ...emptyListingState, q: 'intel' }

    expect(serializeListingState(state, { search: false }).toString()).toBe('')
  })
})

describe('state updates', () => {
  it('toggles brands on and off', () => {
    const on = toggleBrand(emptyListingState, 'amd')
    expect(on.brands).toEqual(['amd'])
    expect(toggleBrand(on, 'amd').brands).toEqual([])
  })

  it('toggles specification values and drops a group once it is empty', () => {
    const on = toggleSpecValue(emptyListingState, 'socket', 'AM5')
    expect(on.specs.get('socket')).toEqual(['AM5'])

    const off = toggleSpecValue(on, 'socket', 'AM5')
    expect(off.specs.has('socket')).toBe(false)
  })

  it('does not mutate the previous state', () => {
    const before = toggleSpecValue(emptyListingState, 'socket', 'AM5')
    toggleSpecValue(before, 'socket', 'LGA')

    expect(before.specs.get('socket')).toEqual(['AM5'])
  })

  it('clears filters but keeps the search text and the sort', () => {
    let state: ListingState = { ...emptyListingState, q: 'intel' }
    state = setSort(toggleBrand(toggleSpecValue(state, 'a', '1'), 'amd'), 'price-asc')

    const cleared = clearFilters(state)

    expect(cleared).toMatchObject({ q: 'intel', sort: 'price-asc', brands: [] })
    expect(cleared.specs.size).toBe(0)
    expect(countActiveFilters(cleared)).toBe(0)
  })

  it('clearing filters on a filters-only state gives a clean URL', () => {
    const state = toggleBrand(toggleSpecValue(emptyListingState, 'a', '1'), 'amd')

    expect(serializeListingState(clearFilters(state)).toString()).toBe('')
  })

  it('counts every selected brand and specification value', () => {
    let state = toggleBrand(emptyListingState, 'amd')
    state = toggleSpecValue(toggleSpecValue(state, 'a', '1'), 'a', '2')

    expect(countActiveFilters(state)).toBe(3)
  })
})
