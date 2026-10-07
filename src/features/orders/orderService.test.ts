import { fetchPolicy } from '@/lib/fetchWithRetry'
import { fetchOrder, placeOrder, type PlaceOrderRequest } from './orderService'

const API = 'http://localhost:3001'
const TOKEN = 'T'.repeat(43)
const KEY = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

const DELIVERY = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '050-1234567',
  city: 'חיפה',
  street: 'הנשיא',
  houseNumber: '12',
  apartment: '',
  postalCode: '',
  notes: '',
}
const ORDER = {
  orderNumber: 'DEMO-7K2M9QX4',
  createdAt: '2026-01-01T10:00:00.000Z',
  status: 'placed',
  lines: [
    { productId: 'A-1', name: 'כרטיס מסך', unitPrice: 750, originalUnitPrice: 1000, quantity: 2 },
  ],
  total: 1500,
  originalTotal: 2000,
  savings: 500,
  delivery: DELIVERY,
}
const request: PlaceOrderRequest = {
  token: TOKEN,
  idempotencyKey: KEY,
  items: [{ productId: 'A-1', quantity: 2 }],
  delivery: DELIVERY,
  expectedTotal: 1500,
}

const json = (body: unknown, status: number) => Response.json(body, { status })
const refusal = (status: number, code: string, details?: Record<string, unknown>) =>
  json({ error: { code, message: 'x', ...(details && { details }) } }, status)

function stubFetch(...answers: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const answer of answers) fetchMock.mockImplementationOnce(async () => answer())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const original = [...fetchPolicy.delaysMs]
afterEach(() => {
  vi.unstubAllGlobals()
  fetchPolicy.delaysMs = original
})

describe('placeOrder: the request', () => {
  it('posts ids, quantities, the delivery details and the expected total, with the key and the token', async () => {
    const fetchMock = stubFetch(() => json(ORDER, 201))

    await placeOrder(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${API}/api/orders`)
    expect(init).toMatchObject({ method: 'POST' })
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      'Idempotency-Key': KEY,
    })
    expect(JSON.parse(init?.body as string)).toEqual({
      items: [{ productId: 'A-1', quantity: 2 }],
      delivery: DELIVERY,
      expectedTotal: 1500,
    })
  })

  it('sends no price, name or total of a product, whatever the cart lines carry', async () => {
    const fetchMock = stubFetch(() => json(ORDER, 201))
    const lines = [{ productId: 'A-1', quantity: 2, price: 1, name: 'Free' }]

    await placeOrder({ ...request, items: lines })

    const sent = JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)
    expect(sent.items).toEqual([{ productId: 'A-1', quantity: 2 }])
  })

  it('never puts the token or the details in the address', async () => {
    const fetchMock = stubFetch(() => json(ORDER, 201))

    await placeOrder(request)

    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).not.toContain(TOKEN)
    expect(url).not.toContain('netanel')
    expect(url).not.toContain('?')
  })
})

describe('placeOrder: what comes back', () => {
  it('gives the order the API made, as the API shows it', async () => {
    stubFetch(() => json(ORDER, 201))

    expect(await placeOrder(request)).toEqual({ ok: true, order: ORDER })
  })

  it('treats the same order given again to a retry (200) as a success', async () => {
    stubFetch(() => json(ORDER, 200))

    expect(await placeOrder(request)).toEqual({ ok: true, order: ORDER })
  })

  it('says "unauthorized" for a 401', async () => {
    stubFetch(() => refusal(401, 'unauthorized'))

    expect(await placeOrder(request)).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('names the products of a 409 product_unavailable', async () => {
    stubFetch(() => refusal(409, 'product_unavailable', { productIds: ['A-1', 'B-2'] }))

    expect(await placeOrder(request)).toEqual({
      ok: false,
      reason: 'product-unavailable',
      productIds: ['A-1', 'B-2'],
    })
  })

  it('gives the new total of a 409 price_changed', async () => {
    stubFetch(() => refusal(409, 'price_changed', { expectedTotal: 1500, total: 1800 }))

    expect(await placeOrder(request)).toEqual({ ok: false, reason: 'price-changed', total: 1800 })
  })

  it('says "key-reused" for a 409 idempotency_key_reuse', async () => {
    stubFetch(() => refusal(409, 'idempotency_key_reuse'))

    expect(await placeOrder(request)).toEqual({ ok: false, reason: 'key-reused' })
  })

  it.each([
    [400, 'invalid-input'],
    [429, 'too-many-requests'],
  ])('says %i is "%s"', async (status, reason) => {
    stubFetch(() => refusal(status, 'x'))

    expect(await placeOrder(request)).toEqual({ ok: false, reason })
  })

  it.each([
    ['a 500', () => refusal(500, 'internal_error')],
    ['a 503', () => refusal(503, 'server_busy')],
    ['a 404', () => refusal(404, 'not_found')],
    ['a 409 it does not know', () => refusal(409, 'something_new')],
    ['a product_unavailable with no products', () => refusal(409, 'product_unavailable', {})],
    ['a price_changed with no total', () => refusal(409, 'price_changed', { total: 'a lot' })],
    ['a 409 that is not an error body', () => json('conflict', 409)],
    ['an order of an unexpected shape', () => json({ orderNumber: 'DEMO-1' }, 201)],
    ['an answer that is not JSON', () => new Response('<html>', { status: 201 })],
    ['an order with a negative total', () => json({ ...ORDER, total: -1 }, 201)],
  ])('says "unavailable" for %s', async (_name, answer) => {
    stubFetch(answer)

    expect(await placeOrder(request)).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('says "unavailable", and does not throw, when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))

    expect(await placeOrder(request)).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('placeOrder: repeating it', () => {
  it.each([
    ['a connection failure', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['a 502', () => json({}, 502)],
    ['a 503', () => json({}, 503)],
    ['a 504', () => json({}, 504)],
  ])('sends the same order again, with the same key, after %s', async (_name, failure) => {
    fetchPolicy.delaysMs = [1, 1]
    const fetchMock = stubFetch(failure, () => json(ORDER, 200))

    const outcome = await placeOrder(request)

    expect(outcome).toEqual({ ok: true, order: ORDER })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [first, second] = fetchMock.mock.calls.map(([, init]) => init)
    expect(second?.headers).toEqual(first?.headers)
    expect(second?.body).toBe(first?.body)
    expect((second?.headers as Record<string, string>)['Idempotency-Key']).toBe(KEY)
  })

  it.each([
    ['a 409', () => refusal(409, 'price_changed', { total: 1800 })],
    ['a 400', () => refusal(400, 'invalid_input')],
    ['a 401', () => refusal(401, 'unauthorized')],
    ['a 429', () => refusal(429, 'rate_limited')],
    ['a 500', () => refusal(500, 'internal_error')],
  ])('does not send it again after %s: the API has answered', async (_name, answer) => {
    fetchPolicy.delaysMs = [1, 1]
    const fetchMock = stubFetch(answer, () => json(ORDER, 201))

    await placeOrder(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up with "unavailable" after the last attempt', async () => {
    fetchPolicy.delaysMs = [1, 1]
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    expect(await placeOrder(request)).toEqual({ ok: false, reason: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('fetchOrder', () => {
  it('asks for the order by its number, with the token as a Bearer token', async () => {
    const fetchMock = stubFetch(() => json(ORDER, 200))

    const outcome = await fetchOrder(TOKEN, 'DEMO-7K2M9QX4')

    expect(outcome).toEqual({ status: 'ok', order: ORDER })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(`${API}/api/orders/DEMO-7K2M9QX4`)
    expect(init?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
    expect(init?.method).toBeUndefined()
  })

  it('writes an order number that is not plain text safely into the address', async () => {
    const fetchMock = stubFetch(() => json({}, 404))

    await fetchOrder(TOKEN, '../auth/me?x=1')

    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${API}/api/orders/..%2Fauth%2Fme%3Fx%3D1`)
  })

  it.each([
    [404, 'not-found'],
    [401, 'unauthorized'],
    [500, 'unavailable'],
    [503, 'unavailable'],
  ])('says %i is "%s"', async (code, status) => {
    stubFetch(() => json({ error: { code: 'x', message: 'x' } }, code))

    expect(await fetchOrder(TOKEN, 'DEMO-7K2M9QX4')).toEqual({ status })
  })

  it('says "unavailable" for an order of an unexpected shape, and when the API cannot be reached', async () => {
    stubFetch(() => json({ orderNumber: 'DEMO-1' }, 200))
    expect(await fetchOrder(TOKEN, 'DEMO-7K2M9QX4')).toEqual({ status: 'unavailable' })

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
    expect(await fetchOrder(TOKEN, 'DEMO-7K2M9QX4')).toEqual({ status: 'unavailable' })
  })

  it('repeats a read that fails because the host is waking up', async () => {
    fetchPolicy.delaysMs = [1]
    const fetchMock = stubFetch(
      () => json({}, 503),
      () => json(ORDER, 200),
    )

    expect(await fetchOrder(TOKEN, 'DEMO-7K2M9QX4')).toEqual({ status: 'ok', order: ORDER })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws when the page cancels the request, as nobody is waiting for the answer', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        controller.abort()
        return Promise.reject(new DOMException('aborted', 'AbortError'))
      }),
    )

    await expect(fetchOrder(TOKEN, 'DEMO-7K2M9QX4', controller.signal)).rejects.toThrow()
  })
})
