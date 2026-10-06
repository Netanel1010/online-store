import { emptyListingState } from '@/features/products/listing/query'
import { makeProduct } from '@/test/fixtures'
import { fetchProductListing, listingPath, ProductDataError } from './productService'

const API = 'http://localhost:3001'

const noFacets = { brands: [], specs: [] }

/** What `GET /api/products` answers for one page of a listing. */
function pageOf(items: unknown[], extra: Record<string, unknown> = {}) {
  return Response.json({
    items,
    page: 1,
    limit: 100,
    total: items.length,
    totalPages: 1,
    ...extra,
  })
}

/** Answers by address, so each test says which request gets which answer. */
function stubFetch(answers: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const url = String(input)
    const answer = answers[url]
    if (!answer) return Promise.reject(new Error(`unexpected request: ${url}`))
    return Promise.resolve(answer())
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const request = (overrides: Partial<Parameters<typeof listingPath>[0]> = {}) => ({
  ...emptyListingState,
  ...overrides,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listingPath', () => {
  it('asks for the filter options and the biggest page when nothing is selected', () => {
    expect(listingPath(request(), 1, true)).toBe('/api/products?facets=true&page=1&limit=100')
  })

  it('leaves the filter options out for the pages after the first', () => {
    expect(listingPath(request(), 2, false)).toBe('/api/products?page=2&limit=100')
  })

  it('sends the search text, the category, the brands, the specifications and the sort', () => {
    const path = listingPath(
      request({
        q: 'rtx 4070',
        category: 'cpu',
        brands: ['amd', 'intel'],
        specs: new Map([
          ['תושבת מעבד', ['AM5', 'LGA 1700']],
          ['תמיכה בזכרון', ['DDR5']],
        ]),
        sort: 'price-asc',
      }),
      1,
      true,
    )

    const params = new URLSearchParams(path.split('?')[1])
    expect([...params]).toEqual([
      ['q', 'rtx 4070'],
      ['category', 'cpu'],
      ['brand', 'amd'],
      ['brand', 'intel'],
      ['s.תושבת מעבד', 'AM5'],
      ['s.תושבת מעבד', 'LGA 1700'],
      ['s.תמיכה בזכרון', 'DDR5'],
      ['sort', 'price-asc'],
      ['facets', 'true'],
      ['page', '1'],
      ['limit', '100'],
    ])
  })

  it('does not send an empty search text or the default sort', () => {
    const params = new URLSearchParams(listingPath(request({ q: '', sort: 'default' }), 1, false))

    expect(params.has('q')).toBe(false)
    expect(params.has('sort')).toBe(false)
  })

  it('encodes what the visitor typed, so it cannot add parameters', () => {
    const path = listingPath(request({ q: 'a&brand=amd#x=1 ?' }), 1, false)
    const params = new URLSearchParams(path.split('?')[1])

    expect(params.getAll('q')).toEqual(['a&brand=amd#x=1 ?'])
    expect(params.has('brand')).toBe(false)
    expect(path).not.toContain('#')
  })
})

describe('fetchProductListing', () => {
  const first = `${API}/api/products?facets=true&page=1&limit=100`

  it('returns the products, the total and the filter options of the API', async () => {
    const product = makeProduct({ id: 'A' })
    const facets = {
      brands: [{ value: 'gigabyte', count: 1 }],
      specs: [{ label: 'זיכרון', options: [{ value: '8GB', count: 1 }] }],
    }
    const fetchMock = stubFetch({ [first]: () => pageOf([product], { facets }) })

    await expect(fetchProductListing(request())).resolves.toEqual({
      products: [product],
      total: 1,
      facets,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends the request to the API as the listing path says', async () => {
    const fetchMock = stubFetch({
      [`${API}/api/products?q=intel&brand=intel&facets=true&page=1&limit=100`]: () =>
        pageOf([], { facets: noFacets }),
    })

    await fetchProductListing(request({ q: 'intel', brands: ['intel'] }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('follows the pagination, asking for the filter options only once', async () => {
    const [a, b, c] = [makeProduct({ id: 'A' }), makeProduct({ id: 'B' }), makeProduct({ id: 'C' })]
    const fetchMock = stubFetch({
      [first]: () => pageOf([a], { totalPages: 3, total: 3, facets: noFacets }),
      [`${API}/api/products?page=2&limit=100`]: () => pageOf([b], { totalPages: 3, total: 3 }),
      [`${API}/api/products?page=3&limit=100`]: () => pageOf([c], { totalPages: 3, total: 3 }),
    })

    const listing = await fetchProductListing(request())

    expect(listing.products).toEqual([a, b, c])
    expect(listing.total).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns an empty listing when nothing matches', async () => {
    stubFetch({ [first]: () => pageOf([], { totalPages: 0, facets: noFacets }) })

    await expect(fetchProductListing(request())).resolves.toEqual({
      products: [],
      total: 0,
      facets: noFacets,
    })
  })

  it('cancels the request when the caller aborts', async () => {
    const controller = new AbortController()
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            signals.push(init.signal!)
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
          }),
      ),
    )

    const pending = fetchProductListing(request(), controller.signal)
    const outcome = expect(pending).rejects.toBeInstanceOf(ProductDataError)
    controller.abort()

    await outcome
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('throws a ProductDataError when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    await expect(fetchProductListing(request())).rejects.toBeInstanceOf(ProductDataError)
    await expect(fetchProductListing(request())).rejects.toThrow(/Could not reach/)
  })

  it.each([400, 404, 500, 503])('throws a ProductDataError for a %i answer', async (status) => {
    stubFetch({ [first]: () => Response.json({ error: { code: 'x' } }, { status }) })

    await expect(fetchProductListing(request())).rejects.toBeInstanceOf(ProductDataError)
    await expect(fetchProductListing(request())).rejects.toThrow(String(status))
  })

  it('throws a ProductDataError when the answer is not JSON', async () => {
    stubFetch({ [first]: () => new Response('<html>', { status: 200 }) })

    await expect(fetchProductListing(request())).rejects.toThrow(/not valid JSON/)
  })

  it('throws a ProductDataError when a product is invalid', async () => {
    stubFetch({
      [first]: () => pageOf([{ id: 'A' }], { facets: noFacets }),
    })

    await expect(fetchProductListing(request())).rejects.toThrow(/failed validation/)
  })

  it.each([
    ['no filter options', {}],
    [
      'a brand the store does not know',
      { facets: { brands: [{ value: 'nvidia', count: 1 }], specs: [] } },
    ],
    [
      'a count that is not a number',
      { facets: { brands: [{ value: 'amd', count: 'x' }], specs: [] } },
    ],
  ])('throws a ProductDataError for %s', async (_name, extra) => {
    stubFetch({ [first]: () => pageOf([], extra) })

    await expect(fetchProductListing(request())).rejects.toBeInstanceOf(ProductDataError)
  })

  it('throws a ProductDataError when a product is on two pages', async () => {
    const product = makeProduct({ id: 'A' })
    stubFetch({
      [first]: () => pageOf([product], { totalPages: 2, facets: noFacets }),
      [`${API}/api/products?page=2&limit=100`]: () => pageOf([product], { totalPages: 2 }),
    })

    await expect(fetchProductListing(request())).rejects.toThrow(/failed validation/)
  })

  it('refuses an answer with an unreasonable number of pages', async () => {
    stubFetch({ [first]: () => pageOf([], { totalPages: 51, facets: noFacets }) })

    await expect(fetchProductListing(request())).rejects.toThrow(/too many pages/)
  })
})
