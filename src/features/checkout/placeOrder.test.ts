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
