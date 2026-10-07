import { makeProduct } from '@/test/fixtures'
import {
  fetchCategoryCounts,
  fetchProduct,
  fetchProductsByIds,
  fetchRecommendedProducts,
  fetchSaleProducts,
  fetchSuggestions,
  idsPath,
  ProductDataError,
  sectionPath,
  suggestionsPath,
} from './productService'

const API = 'http://localhost:3001'

/** What `GET /api/products` answers for one page. */
function pageOf(items: unknown[], totalPages = 1) {
  return Response.json({ items, page: 1, limit: 100, total: items.length, totalPages })
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

const failWith = (error: Error) => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the products on sale (every page of a list)', () => {
  const firstPage = `${API}/api/products?sale=true&page=1&limit=100`

  it('returns the validated products of the API', async () => {
    const product = makeProduct()
    const fetchMock = stubFetch({ [firstPage]: () => pageOf([product]) })

    await expect(fetchSaleProducts()).resolves.toEqual([product])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(firstPage, expect.anything())
  })

  it('follows the pagination and returns the products of every page, in order', async () => {
    const [a, b, c] = [makeProduct({ id: 'A' }), makeProduct({ id: 'B' }), makeProduct({ id: 'C' })]
    const fetchMock = stubFetch({
      [firstPage]: () => pageOf([a], 3),
      [`${API}/api/products?sale=true&page=2&limit=100`]: () => pageOf([b], 3),
      [`${API}/api/products?sale=true&page=3&limit=100`]: () => pageOf([c], 3),
    })

    await expect(fetchSaleProducts()).resolves.toEqual([a, b, c])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns an empty catalog when the API has no products', async () => {
    stubFetch({ [firstPage]: () => pageOf([], 0) })

    await expect(fetchSaleProducts()).resolves.toEqual([])
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

    const pending = fetchSaleProducts(controller.signal)
    const outcome = expect(pending).rejects.toBeInstanceOf(ProductDataError)
    controller.abort()

    await outcome
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('throws a ProductDataError when the API cannot be reached', async () => {
    failWith(new TypeError('network down'))

    await expect(fetchSaleProducts()).rejects.toBeInstanceOf(ProductDataError)
    await expect(fetchSaleProducts()).rejects.toThrow(/Could not reach/)
  })

  it('throws on a non-OK response, such as the API being down or without a database', async () => {
    stubFetch({ [firstPage]: () => new Response('{}', { status: 503 }) })

    await expect(fetchSaleProducts()).rejects.toThrow(/status 503/)
  })

  it('throws when a later page fails, instead of returning a partial catalog', async () => {
    stubFetch({
      [firstPage]: () => pageOf([makeProduct({ id: 'A' })], 2),
      [`${API}/api/products?sale=true&page=2&limit=100`]: () => new Response('{}', { status: 500 }),
    })

    await expect(fetchSaleProducts()).rejects.toThrow(/status 500/)
  })

  it('throws when the body is not JSON', async () => {
    stubFetch({ [firstPage]: () => new Response('<html>', { status: 200 }) })

    await expect(fetchSaleProducts()).rejects.toThrow(/not valid JSON/)
  })

  it('throws when the answer is not a page of the API', async () => {
    stubFetch({ [firstPage]: () => Response.json([makeProduct()]) })

    await expect(fetchSaleProducts()).rejects.toThrow(/failed validation/)
  })

  it('throws when a product fails the schema', async () => {
    stubFetch({ [firstPage]: () => pageOf([{ id: 'only-an-id' }]) })

    await expect(fetchSaleProducts()).rejects.toThrow(/failed validation/)
  })

  it('throws when the same product is on two pages', async () => {
    const product = makeProduct({ id: 'A' })
    stubFetch({
      [firstPage]: () => pageOf([product], 2),
      [`${API}/api/products?sale=true&page=2&limit=100`]: () => pageOf([product], 2),
    })

    await expect(fetchSaleProducts()).rejects.toThrow(/failed validation/)
  })

  it('refuses a catalog with an absurd number of pages', async () => {
    const fetchMock = stubFetch({ [firstPage]: () => pageOf([makeProduct()], 51) })

    await expect(fetchSaleProducts()).rejects.toThrow(/too many pages/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('fetchProduct', () => {
  it('returns the validated product', async () => {
    const product = makeProduct({ id: 'GV-N406' })
    const fetchMock = stubFetch({ [`${API}/api/products/GV-N406`]: () => Response.json(product) })

    await expect(fetchProduct('GV-N406')).resolves.toEqual(product)
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/products/GV-N406`, expect.anything())
  })

  it('encodes the id in the address', async () => {
    const fetchMock = stubFetch({
      [`${API}/api/products/a%20b%2Fc`]: () => new Response('{}', { status: 400 }),
    })

    await fetchProduct('a b/c')

    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/products/a%20b%2Fc`, expect.anything())
  })

  it('returns null for a product that does not exist (404)', async () => {
    stubFetch({ [`${API}/api/products/NOPE`]: () => new Response('{}', { status: 404 }) })

    await expect(fetchProduct('NOPE')).resolves.toBeNull()
  })

  it('returns null for an id the API does not accept (400)', async () => {
    stubFetch({ [`${API}/api/products/bad`]: () => new Response('{}', { status: 400 }) })

    await expect(fetchProduct('bad')).resolves.toBeNull()
  })

  it('throws on any other failure, so it is not mistaken for a missing product', async () => {
    stubFetch({ [`${API}/api/products/A`]: () => new Response('{}', { status: 500 }) })

    await expect(fetchProduct('A')).rejects.toThrow(/status 500/)
  })

  it('throws a ProductDataError when the API cannot be reached', async () => {
    failWith(new TypeError('network down'))

    await expect(fetchProduct('A')).rejects.toBeInstanceOf(ProductDataError)
  })

  it('throws when the body is not JSON or not a product', async () => {
    stubFetch({
      [`${API}/api/products/A`]: () => new Response('<html>', { status: 200 }),
      [`${API}/api/products/B`]: () => Response.json({ id: 'B' }),
    })

    await expect(fetchProduct('A')).rejects.toThrow(/not valid JSON/)
    await expect(fetchProduct('B')).rejects.toThrow(/failed validation/)
  })
})

describe('the recommended products', () => {
  it('asks for the recommended products, all pages, and returns them', async () => {
    const product = makeProduct({ id: 'R-1', isRecommended: true })
    const fetchMock = stubFetch({
      [`${API}/api/products?recommended=true&page=1&limit=100`]: () => pageOf([product]),
    })

    await expect(fetchRecommendedProducts()).resolves.toEqual([product])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('fetchProductsByIds', () => {
  const some = [makeProduct({ id: 'A-1' }), makeProduct({ id: 'B-2' })]

  it('asks for the ids in one request and returns the products found', async () => {
    const fetchMock = stubFetch({ [`${API}${idsPath(['A-1', 'B-2'])}`]: () => pageOf(some) })

    await expect(fetchProductsByIds(['A-1', 'B-2'])).resolves.toEqual(some)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('writes the ids as one parameter, with the largest page size', () => {
    const url = new URL(idsPath(['A-1', 'B 2']), 'http://api.test')

    expect(url.pathname).toBe('/api/products')
    expect(url.searchParams.get('ids')).toBe('A-1,B 2')
    expect(url.searchParams.get('limit')).toBe('100')
  })

  it('asks nothing for no ids', async () => {
    const fetchMock = stubFetch({})

    await expect(fetchProductsByIds([])).resolves.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks once for an id that is given twice', async () => {
    const fetchMock = stubFetch({ [`${API}${idsPath(['A-1'])}`]: () => pageOf([some[0]]) })

    await expect(fetchProductsByIds(['A-1', 'A-1'])).resolves.toEqual([some[0]])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('leaves out an id the API has no product for', async () => {
    stubFetch({ [`${API}${idsPath(['A-1', 'GONE'])}`]: () => pageOf([some[0]]) })

    await expect(fetchProductsByIds(['A-1', 'GONE'])).resolves.toEqual([some[0]])
  })

  it('asks for a hundred ids at a time, all requests together', async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `P-${i}`)
    const asked: string[][] = []
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const wanted = new URL(String(input)).searchParams.get('ids')!.split(',')
      asked.push(wanted)
      return Promise.resolve(pageOf(wanted.map((id) => makeProduct({ id }))))
    })

    const found = await fetchProductsByIds(ids)

    expect(asked.map((chunk) => chunk.length)).toEqual([100, 100, 30])
    expect(found.map((product) => product.id)).toEqual(ids)
  })

  it('throws, and returns nothing partial, when one of the requests fails', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `P-${i}`)
    let calls = 0
    vi.stubGlobal('fetch', () => {
      calls += 1
      return Promise.resolve(calls === 1 ? pageOf([]) : new Response('{}', { status: 500 }))
    })

    await expect(fetchProductsByIds(ids)).rejects.toThrow(/status 500/)
  })

  it('throws a ProductDataError when the API cannot be reached or answers badly', async () => {
    failWith(new TypeError('network down'))
    await expect(fetchProductsByIds(['A-1'])).rejects.toBeInstanceOf(ProductDataError)

    stubFetch({ [`${API}${idsPath(['A-1'])}`]: () => pageOf([{ id: 'only-an-id' }]) })
    await expect(fetchProductsByIds(['A-1'])).rejects.toThrow(/failed validation/)
  })
})

describe('fetchSuggestions', () => {
  it('asks the API to search, for five products', async () => {
    const product = makeProduct({ id: 'S-1' })
    const fetchMock = stubFetch({
      [`${API}${suggestionsPath('rtx 4070')}`]: () => pageOf([product]),
    })

    await expect(fetchSuggestions('rtx 4070')).resolves.toEqual([product])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = new URL(suggestionsPath('rtx 4070'), 'http://api.test')
    expect(url.searchParams.get('q')).toBe('rtx 4070')
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('keeps what the visitor typed a value, so it cannot add a parameter', () => {
    const url = new URL(suggestionsPath('a&limit=100#x'), 'http://api.test')

    expect(url.searchParams.get('q')).toBe('a&limit=100#x')
    expect(url.searchParams.get('limit')).toBe('5')
  })

  it('throws when the API fails', async () => {
    stubFetch({ [`${API}${suggestionsPath('x')}`]: () => new Response('{}', { status: 503 }) })

    await expect(fetchSuggestions('x')).rejects.toThrow(/status 503/)
  })
})

describe('fetchCategoryCounts', () => {
  it('returns the number of products of each category', async () => {
    stubFetch({
      [`${API}/api/categories`]: () =>
        Response.json({
          items: [
            { id: 'cpu', count: 4 },
            { id: 'gpu', count: 6 },
          ],
        }),
    })

    await expect(fetchCategoryCounts()).resolves.toEqual(
      new Map([
        ['cpu', 4],
        ['gpu', 6],
      ]),
    )
  })

  it('throws on a category it does not know, a count that is not a number, or a failure', async () => {
    stubFetch({
      [`${API}/api/categories`]: () => Response.json({ items: [{ id: 'toaster', count: 1 }] }),
    })
    await expect(fetchCategoryCounts()).rejects.toThrow(/failed validation/)

    stubFetch({
      [`${API}/api/categories`]: () => Response.json({ items: [{ id: 'cpu', count: 'x' }] }),
    })
    await expect(fetchCategoryCounts()).rejects.toThrow(/failed validation/)

    stubFetch({ [`${API}/api/categories`]: () => new Response('{}', { status: 500 }) })
    await expect(fetchCategoryCounts()).rejects.toThrow(/status 500/)
  })
})

describe('the addresses of the sections', () => {
  it('asks for a page of the sale products or of the recommended ones', () => {
    expect(sectionPath('sale', 2)).toBe('/api/products?sale=true&page=2&limit=100')
    expect(sectionPath('recommended', 1)).toBe('/api/products?recommended=true&page=1&limit=100')
  })
})
