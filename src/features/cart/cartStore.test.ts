import { MAX_QUANTITY, selectCartCount, selectQuantityOf, useCartStore } from './cartStore'

const state = () => useCartStore.getState()
const STORAGE_KEY = 'online-store:cart'

describe('cart store', () => {
  it('starts empty', () => {
    expect(state().items).toEqual([])
    expect(selectCartCount(state())).toBe(0)
  })

  it('adds a product with quantity 1 by default', () => {
    state().addItem('A')

    expect(state().items).toEqual([{ productId: 'A', quantity: 1 }])
  })

  it('merges repeated adds into one line instead of duplicating it', () => {
    state().addItem('A')
    state().addItem('A', 2)
    state().addItem('B')

    expect(state().items).toEqual([
      { productId: 'A', quantity: 3 },
      { productId: 'B', quantity: 1 },
    ])
  })

  it('caps the quantity at the maximum', () => {
    state().addItem('A', MAX_QUANTITY)
    state().addItem('A', 5)
    expect(selectQuantityOf('A')(state())).toBe(MAX_QUANTITY)

    state().setQuantity('A', 1000)
    expect(selectQuantityOf('A')(state())).toBe(MAX_QUANTITY)
  })

  it('ignores invalid quantities when adding', () => {
    state().addItem('A', 0)
    state().addItem('A', -3)
    state().addItem('A', Number.NaN)

    expect(state().items).toEqual([])
  })

  it('sets a quantity, clamps it to at least 1 and ignores NaN', () => {
    state().addItem('A')

    state().setQuantity('A', 7)
    expect(selectQuantityOf('A')(state())).toBe(7)

    state().setQuantity('A', 0)
    expect(selectQuantityOf('A')(state())).toBe(1)

    state().setQuantity('A', 2.9)
    expect(selectQuantityOf('A')(state())).toBe(2)

    state().setQuantity('A', Number.NaN)
    expect(selectQuantityOf('A')(state())).toBe(2)
  })

  it('does not create a line when setting the quantity of a missing product', () => {
    state().setQuantity('missing', 3)

    expect(state().items).toEqual([])
  })

  it('removes a line', () => {
    state().addItem('A')
    state().addItem('B')
    state().removeItem('A')

    expect(state().items).toEqual([{ productId: 'B', quantity: 1 }])
  })

  it('counts units, not lines', () => {
    state().addItem('A', 2)
    state().addItem('B', 3)

    expect(selectCartCount(state())).toBe(5)
  })

  it('drops lines for products that no longer exist', () => {
    state().addItem('A')
    state().addItem('GONE')
    state().retainOnly(new Set(['A']))

    expect(state().items).toEqual([{ productId: 'A', quantity: 1 }])
  })

  it('clears the cart', () => {
    state().addItem('A')
    state().clear()

    expect(state().items).toEqual([])
  })
})

describe('cart persistence', () => {
  it('persists product ids and quantities only', () => {
    state().addItem('GP-P650G', 2)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    expect(stored.state).toEqual({ items: [{ productId: 'GP-P650G', quantity: 2 }] })
    expect(stored.version).toBe(1)
    // No product copies: nothing like a name, price or image is stored.
    expect(Object.keys(stored.state.items[0]).sort()).toEqual(['productId', 'quantity'])
  })

  it('restores a valid stored cart', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { items: [{ productId: 'A', quantity: 4 }] }, version: 1 }),
    )

    await useCartStore.persist.rehydrate()

    expect(state().items).toEqual([{ productId: 'A', quantity: 4 }])
  })

  it('merges duplicate stored lines', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          items: [
            { productId: 'A', quantity: 2 },
            { productId: 'A', quantity: 3 },
          ],
        },
        version: 1,
      }),
    )

    await useCartStore.persist.rehydrate()

    expect(state().items).toEqual([{ productId: 'A', quantity: 5 }])
  })

  it.each([
    ['negative quantity', { items: [{ productId: 'A', quantity: -5 }] }],
    ['fractional quantity', { items: [{ productId: 'A', quantity: 1.5 }] }],
    ['quantity over the maximum', { items: [{ productId: 'A', quantity: 1000 }] }],
    ['string quantity', { items: [{ productId: 'A', quantity: '2' }] }],
    ['empty product id', { items: [{ productId: '', quantity: 1 }] }],
    ['items that are not an array', { items: 'oops' }],
    ['missing items', {}],
  ])('ignores stored data with a %s', async (_label, stored) => {
    useCartStore.setState({ items: [{ productId: 'KEEP', quantity: 1 }] })
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: stored, version: 1 }))

    await useCartStore.persist.rehydrate()

    expect(state().items).toEqual([{ productId: 'KEEP', quantity: 1 }])
  })

  it('survives non-JSON garbage in storage', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json')

    await expect(useCartStore.persist.rehydrate()).resolves.not.toThrow()
    expect(state().items).toEqual([])
  })
})
