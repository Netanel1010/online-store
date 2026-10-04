import { makeProduct } from '@/test/fixtures'
import { fetchProducts, ProductDataError } from './productService'

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchProducts', () => {
  it('returns validated products', async () => {
    const product = makeProduct()
    stubFetch(() => Promise.resolve(Response.json([product])))

    await expect(fetchProducts()).resolves.toEqual([product])
    expect(fetch).toHaveBeenCalledWith('/data/products.json', expect.anything())
  })

  it('throws a ProductDataError when the request fails', async () => {
    stubFetch(() => Promise.reject(new TypeError('network down')))

    await expect(fetchProducts()).rejects.toBeInstanceOf(ProductDataError)
  })

  it('throws on a non-OK response', async () => {
    stubFetch(() => Promise.resolve(new Response('nope', { status: 404 })))

    await expect(fetchProducts()).rejects.toThrow(/status 404/)
  })

  it('throws when the body is not JSON', async () => {
    stubFetch(() => Promise.resolve(new Response('<html>', { status: 200 })))

    await expect(fetchProducts()).rejects.toThrow(/not valid JSON/)
  })

  it('throws when the data fails schema validation', async () => {
    stubFetch(() => Promise.resolve(Response.json([{ id: 'only-an-id' }])))

    await expect(fetchProducts()).rejects.toThrow(/failed validation/)
  })
})
