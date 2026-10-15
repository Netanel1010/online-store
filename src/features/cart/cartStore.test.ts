import {
  MAX_QUANTITY,
  readStoredCart,
  selectCartCount,
  selectQuantityOf,
  useCartStore,
} from './cartStore'

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

/**
 * Two tabs share one storage and each holds its own copy of the cart in memory. Another tab is
 * played here by writing to storage behind this store's back, which is all another tab does.
 */
describe('a change starts from the cart that is kept in the browser, not from the memory of this tab', () => {
  const line = (productId: string, quantity = 1) => ({ productId, quantity })
  const storedItems = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')?.state?.items

  /** What another tab does when it changes the cart: it writes the whole cart to storage. */
  function anotherTabSaves(items: { productId: string; quantity: number }[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { items }, version: 1 }))
  }

  it('adds to a cart that another tab has added to since this tab last looked', () => {
    state().addItem('A')
    anotherTabSaves([line('A'), line('B')]) // this tab still thinks the cart is only A

    state().addItem('C')

    expect(state().items).toEqual([line('A'), line('B'), line('C')])
    expect(storedItems()).toEqual([line('A'), line('B'), line('C')])
  })

  it('changes the quantity of a line that only the other tab knows', () => {
    state().addItem('A')
    anotherTabSaves([line('A'), line('B', 2)])

    state().setQuantity('B', 5)

    expect(state().items).toEqual([line('A'), line('B', 5)])
  })

  it('removes a line without removing the ones another tab added', () => {
    state().addItem('A')
    anotherTabSaves([line('A'), line('B')])

    state().removeItem('A')

    expect(state().items).toEqual([line('B')])
    expect(storedItems()).toEqual([line('B')])
  })

  it('drops from the stored cart the lines whose product is gone, and keeps the rest', () => {
    state().addItem('A')
    anotherTabSaves([line('A'), line('B'), line('GONE')])

    state().retainOnly(new Set(['A', 'B']))

    expect(state().items).toEqual([line('A'), line('B')])
    expect(storedItems()).toEqual([line('A'), line('B')])
  })

  it('adopts what is stored even when retainOnly has nothing to drop', () => {
    state().addItem('A')
    anotherTabSaves([line('A'), line('B')])

    state().retainOnly(new Set(['A', 'B']))

    expect(state().items).toEqual([line('A'), line('B')])
  })

  describe('when two tabs change the same line, the later write wins', () => {
    it('a quantity that is set replaces the one the other tab set', () => {
      state().addItem('A')
      anotherTabSaves([line('A', 3)])

      state().setQuantity('A', 2)

      expect(state().items).toEqual([line('A', 2)])
    })

    it('an add is added to the quantity the other tab left, and does not replace it', () => {
      state().addItem('A')
      anotherTabSaves([line('A', 3)])

      state().addItem('A', 2)

      expect(state().items).toEqual([line('A', 5)])
    })

    it('a line that another tab removed does not come back from the memory of this tab', () => {
      state().addItem('A')
      state().addItem('B')
      anotherTabSaves([line('B')]) // the other tab removed A

      state().setQuantity('B', 4)

      expect(state().items).toEqual([line('B', 4)])
    })
  })

  describe('what is stored cannot be used', () => {
    it.each([
      ['nothing is stored', () => localStorage.removeItem(STORAGE_KEY)],
      ['it is not JSON', () => localStorage.setItem(STORAGE_KEY, '{not json')],
      [
        'it is not a cart',
        () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { items: 'oops' } })),
      ],
      [
        'a line is not valid',
        () =>
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ state: { items: [{ productId: 'A', quantity: -1 }] }, version: 1 }),
          ),
      ],
    ])('goes by the cart of this tab when %s', (_why, spoil) => {
      state().addItem('A')
      spoil()

      state().addItem('B')

      expect(state().items).toEqual([line('A'), line('B')])
      expect(readStoredCart()).toEqual([line('A'), line('B')])
    })

    it('goes by the cart of this tab when storage cannot be read', () => {
      state().addItem('A')
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage is blocked')
      })

      expect(() => state().addItem('B')).not.toThrow()

      expect(state().items).toEqual([line('A'), line('B')])
    })
  })

  it('is a read followed by a write, not a transaction: a change that lands between them is overwritten', () => {
    // Pinned on purpose, so that nobody takes the fix for more than it is. Another tab's write that
    // arrives after this tab read the cart and before it writes it is lost: the later write wins.
    state().addItem('A')
    const read = Storage.prototype.getItem
    let injected = false
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      const value = read.call(this, key)
      if (key === STORAGE_KEY && !injected) {
        injected = true
        anotherTabSaves([line('A'), line('B')]) // lands right after this tab's read
      }
      return value
    })

    state().addItem('C')

    expect(storedItems()).toEqual([line('A'), line('C')]) // B, written in between, is gone
  })

  describe('readStoredCart', () => {
    it('reads the cart as it is stored, with repeated lines joined', () => {
      anotherTabSaves([line('A', 2), line('A', 3), line('B')])

      expect(readStoredCart()).toEqual([line('A', 5), line('B')])
    })

    it('says nothing is stored when there is nothing to read', () => {
      expect(readStoredCart()).toBeNull()
    })
  })
})
