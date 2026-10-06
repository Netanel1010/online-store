import { makeProduct } from '@/test/fixtures'
import { fetchProduct, fetchProducts, ProductDataError } from './productService'

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

describe('fetchProducts', () => {
  const firstPage = `${API}/api/products?page=1&limit=100`

  it('returns the validated products of the API', async () => {
    const product = makeProduct()
    const fetchMock = stubFetch({ [firstPage]: () => pageOf([product]) })

    await expect(fetchProducts()).resolves.toEqual([product])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(firstPage, expect.anything())
  })

  it('follows the pagination and returns the products of every page, in order', async () => {
    const [a, b, c] = [makeProduct({ id: 'A' }), makeProduct({ id: 'B' }), makeProduct({ id: 'C' })]
    const fetchMock = stubFetch({
      [firstPage]: () => pageOf([a], 3),
      [`${API}/api/products?page=2&limit=100`]: () => pageOf([b], 3),
      [`${API}/api/products?page=3&limit=100`]: () => pageOf([c], 3),
    })

    await expect(fetchProducts()).resolves.toEqual([a, b, c])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns an empty catalog when the API has no products', async () => {
    stubFetch({ [firstPage]: () => pageOf([], 0) })

    await expect(fetchProducts()).resolves.toEqual([])
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

    const pending = fetchProducts(controller.signal)
    const outcome = expect(pending).rejects.toBeInstanceOf(ProductDataError)
    controller.abort()

    await outcome
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
  })

  it('throws a ProductDataError when the API cannot be reached', async () => {
    failWith(new TypeError('network down'))

    await expect(fetchProducts()).rejects.toBeInstanceOf(ProductDataError)
    await expect(fetchProducts()).rejects.toThrow(/Could not reach/)
  })

  it('throws on a non-OK response, such as the API being down or without a database', async () => {
    stubFetch({ [firstPage]: () => new Response('{}', { status: 503 }) })

    await expect(fetchProducts()).rejects.toThrow(/status 503/)
  })

  it('throws when a later page fails, instead of returning a partial catalog', async () => {
    stubFetch({
      [firstPage]: () => pageOf([makeProduct({ id: 'A' })], 2),
      [`${API}/api/products?page=2&limit=100`]: () => new Response('{}', { status: 500 }),
    })

    await expect(fetchProducts()).rejects.toThrow(/status 500/)
  })

  it('throws when the body is not JSON', async () => {
    stubFetch({ [firstPage]: () => new Response('<html>', { status: 200 }) })

    await expect(fetchProducts()).rejects.toThrow(/not valid JSON/)
  })

  it('throws when the answer is not a page of the API', async () => {
    stubFetch({ [firstPage]: () => Response.json([makeProduct()]) })

    await expect(fetchProducts()).rejects.toThrow(/failed validation/)
  })

  it('throws when a product fails the schema', async () => {
    stubFetch({ [firstPage]: () => pageOf([{ id: 'only-an-id' }]) })

    await expect(fetchProducts()).rejects.toThrow(/failed validation/)
  })

  it('throws when the same product is on two pages', async () => {
    const product = makeProduct({ id: 'A' })
    stubFetch({
      [firstPage]: () => pageOf([product], 2),
      [`${API}/api/products?page=2&limit=100`]: () => pageOf([product], 2),
    })

    await expect(fetchProducts()).rejects.toThrow(/failed validation/)
  })

  it('refuses a catalog with an absurd number of pages', async () => {
    const fetchMock = stubFetch({ [firstPage]: () => pageOf([makeProduct()], 51) })

    await expect(fetchProducts()).rejects.toThrow(/too many pages/)
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
