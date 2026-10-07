import { makeProduct } from '@/test/fixtures'
import { checkoutSuccessStateSchema, EmptyOrderError, placeDemoOrder } from './placeOrder'

const products = [makeProduct({ id: 'A' }), makeProduct({ id: 'B' })]

describe('placeDemoOrder', () => {
  it('returns a demo reference number, the ordered items and the email', () => {
    const order = placeDemoOrder({
      items: [
        { productId: 'B', quantity: 2 },
        { productId: 'A', quantity: 1 },
      ],
      products,
      email: 'a@b.co',
    })

    expect(order.orderId).toMatch(/^DEMO-\d{6}$/)
    expect(order.email).toBe('a@b.co')
    expect(order.items).toEqual([
      { productId: 'B', quantity: 2 },
      { productId: 'A', quantity: 1 },
    ])
  })

  it('contains no prices (they are always worked out from the catalog)', () => {
    const order = placeDemoOrder({
      items: [{ productId: 'A', quantity: 1 }],
      products,
      email: 'a@b.co',
    })

    expect(Object.keys(order).sort()).toEqual(['email', 'items', 'orderId'])
    expect(Object.keys(order.items[0]!).sort()).toEqual(['productId', 'quantity'])
  })

  it('leaves out products that are not in the catalog', () => {
    const order = placeDemoOrder({
      items: [
        { productId: 'GONE', quantity: 3 },
        { productId: 'A', quantity: 1 },
      ],
      products,
      email: 'a@b.co',
    })

    expect(order.items).toEqual([{ productId: 'A', quantity: 1 }])
  })

  it('refuses an empty order', () => {
    expect(() => placeDemoOrder({ items: [], products, email: 'a@b.co' })).toThrow(EmptyOrderError)
  })

  it('refuses an order of only unknown products', () => {
    expect(() =>
      placeDemoOrder({ items: [{ productId: 'GONE', quantity: 1 }], products, email: 'a@b.co' }),
    ).toThrow(EmptyOrderError)
  })

  it('does not modify the cart items it was given', () => {
    const items = [{ productId: 'A', quantity: 1 }]

    placeDemoOrder({ items, products, email: 'a@b.co' })

    expect(items).toEqual([{ productId: 'A', quantity: 1 }])
  })
})

describe('checkoutSuccessStateSchema', () => {
  const valid = {
    orderId: 'DEMO-123456',
    email: 'a@b.co',
    items: [{ productId: 'A', quantity: 1 }],
  }

  it('accepts what the checkout produces', () => {
    expect(checkoutSuccessStateSchema.safeParse(valid).success).toBe(true)
  })

  it.each([
    ['no state', undefined],
    ['a wrong order id', { ...valid, orderId: '123' }],
    ['no items', { ...valid, items: [] }],
    ['a zero quantity', { ...valid, items: [{ productId: 'A', quantity: 0 }] }],
    ['a string state', 'x'],
  ])('rejects %s', (_label, state) => {
    expect(checkoutSuccessStateSchema.safeParse(state).success).toBe(false)
  })
})

describe('the demo reference number', () => {
  const draws = (...values: number[]) => {
    const queue = [...values]
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
      array[0] = queue.shift()!
      return array
    }) as typeof crypto.getRandomValues)
    return queue
  }
  const order = () =>
    placeDemoOrder({ items: [{ productId: 'A', quantity: 1 }], products, email: 'a@b.co' })

  afterEach(() => vi.restoreAllMocks())

  it('throws away random draws that would make some numbers more likely than others', () => {
    // 4_294_000_000 and above are the leftover of 2^32 that is not a whole multiple of 1,000,000.
    const left = draws(4_294_000_000, 4_294_967_295, 123_456)

    expect(order().orderId).toBe('DEMO-123456')
    expect(left).toHaveLength(0)
  })

  it('keeps every draw below the cut-off, padded to six digits', () => {
    draws(4_293_999_999)
    expect(order().orderId).toBe('DEMO-999999')
    draws(5)
    expect(order().orderId).toBe('DEMO-000005')
  })
})
