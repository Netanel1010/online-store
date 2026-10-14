import type { Mock } from 'vitest'
import { CART_STORAGE_KEY, useCartStore } from './cartStore'
import { startCartTabSync } from './cartTabSync'

const line = (productId: string, quantity = 1) => ({ productId, quantity })
const items = () => useCartStore.getState().items

/**
 * Another tab is played by writing to storage, as another tab does, and then telling this tab, as the
 * browser does: a `storage` event that names the key and the area (it is never sent to the tab that
 * wrote). The real thing, two tabs in a browser, is in e2e/cart-tabs.spec.ts.
 */
function anotherTabSaves(cart: unknown, { announce = true } = {}) {
  const value = JSON.stringify({ state: cart, version: 1 })
  localStorage.setItem(CART_STORAGE_KEY, value)
  if (announce) {
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: CART_STORAGE_KEY,
        newValue: value,
        storageArea: localStorage,
      }),
    )
  }
  return value
}

let stop: () => void = () => undefined
let taken: Mock<() => void>

beforeEach(() => {
  taken = vi.fn<() => void>()
  stop = startCartTabSync(taken)
})
afterEach(() => stop())

describe('a change made in another tab', () => {
  it('is taken at once: this tab shows the cart that the browser keeps', () => {
    useCartStore.getState().addItem('A')

    anotherTabSaves({ items: [line('A'), line('B', 2)] })

    expect(items()).toEqual([line('A'), line('B', 2)])
    expect(taken).toHaveBeenCalledTimes(1)
  })

  it('can empty the cart, as an order placed in the other tab does', () => {
    useCartStore.getState().addItem('A')

    anotherTabSaves({ items: [] })

    expect(items()).toEqual([])
    expect(taken).toHaveBeenCalledTimes(1)
  })

  it('does not set the other tabs off again: what is taken is written back unchanged', () => {
    useCartStore.getState().addItem('A')
    const written: string[] = []
    const write = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === CART_STORAGE_KEY) written.push(value)
      write.call(this, key, value)
    })

    const theirs = anotherTabSaves({ items: [line('A'), line('B')] })

    // Whatever this tab wrote is what the other tab wrote: the browser announces no change for that.
    expect(written.every((value) => value === theirs)).toBe(true)
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(theirs)
  })

  it('makes no change to a tab that already has that cart, and says nothing', () => {
    useCartStore.getState().addItem('A')
    const before = items()

    anotherTabSaves({ items: [line('A')] })

    expect(items()).toBe(before)
    expect(taken).not.toHaveBeenCalled()
  })

  it('is not mistaken for a change this tab made itself', () => {
    useCartStore.getState().addItem('A')
    useCartStore.getState().addItem('B')

    expect(taken).not.toHaveBeenCalled()
  })

  it('is joined in lines, as anything read from storage is', () => {
    anotherTabSaves({ items: [line('A', 2), line('A', 3)] })

    expect(items()).toEqual([line('A', 5)])
  })
})

describe('what is not a change to the cart', () => {
  it('another key', () => {
    useCartStore.getState().addItem('A')
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ state: { items: [line('B')] }, version: 1 }),
    )

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'online-store:favorites', storageArea: localStorage }),
    )

    expect(items()).toEqual([line('A')])
    expect(taken).not.toHaveBeenCalled()
  })

  it('a change in sessionStorage', () => {
    useCartStore.getState().addItem('A')
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ state: { items: [line('B')] }, version: 1 }),
    )

    window.dispatchEvent(
      new StorageEvent('storage', { key: CART_STORAGE_KEY, storageArea: sessionStorage }),
    )

    expect(items()).toEqual([line('A')])
  })

  it('the storage being cleared, or the cart removed from it: the cart of this tab stays', () => {
    useCartStore.getState().addItem('A')
    localStorage.removeItem(CART_STORAGE_KEY)

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: CART_STORAGE_KEY,
        newValue: null,
        storageArea: localStorage,
      }),
    )
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }))

    expect(items()).toEqual([line('A')])
    expect(taken).not.toHaveBeenCalled()
  })

  it.each([
    ['not JSON', () => localStorage.setItem(CART_STORAGE_KEY, '{not json')],
    [
      'not a cart',
      () => localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ state: { items: 'oops' } })),
    ],
    [
      'a line with a negative quantity',
      () =>
        localStorage.setItem(
          CART_STORAGE_KEY,
          JSON.stringify({ state: { items: [line('B', -1)] }, version: 1 }),
        ),
    ],
    [
      'a line with a quantity over the maximum',
      () =>
        localStorage.setItem(
          CART_STORAGE_KEY,
          JSON.stringify({ state: { items: [line('B', 1000)] }, version: 1 }),
        ),
    ],
  ])('stored data that is %s: the cart of this tab stays', (_what, spoil) => {
    useCartStore.getState().addItem('A')
    spoil()

    window.dispatchEvent(
      new StorageEvent('storage', { key: CART_STORAGE_KEY, storageArea: localStorage }),
    )

    expect(items()).toEqual([line('A')])
    expect(taken).not.toHaveBeenCalled()
  })

  it('storage that cannot be read: nothing is thrown and the cart of this tab stays', () => {
    useCartStore.getState().addItem('A')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage is blocked')
    })

    expect(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: CART_STORAGE_KEY, storageArea: localStorage }),
      ),
    ).not.toThrow()

    expect(items()).toEqual([line('A')])
  })
})

describe('a tab that may have missed the events', () => {
  function showTab(state: DocumentVisibilityState) {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('reads the cart again when it becomes visible', () => {
    useCartStore.getState().addItem('A')
    anotherTabSaves({ items: [line('A'), line('B')] }, { announce: false })

    showTab('visible')

    expect(items()).toEqual([line('A'), line('B')])
    expect(taken).toHaveBeenCalledTimes(1)
  })

  it('does nothing when it becomes hidden', () => {
    useCartStore.getState().addItem('A')
    anotherTabSaves({ items: [line('A'), line('B')] }, { announce: false })

    showTab('hidden')

    expect(items()).toEqual([line('A')])
    expect(taken).not.toHaveBeenCalled()
  })

  it('reads the cart again when it is restored from the back-forward cache, and only then', () => {
    useCartStore.getState().addItem('A')
    anotherTabSaves({ items: [line('A'), line('B')] }, { announce: false })

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    expect(items()).toEqual([line('A')])

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    expect(items()).toEqual([line('A'), line('B')])
    expect(taken).toHaveBeenCalledTimes(1)
  })
})

describe('stopping', () => {
  it('stops listening to every one of the events', () => {
    useCartStore.getState().addItem('A')
    stop()

    anotherTabSaves({ items: [line('A'), line('B')] })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(items()).toEqual([line('A')])
    expect(taken).not.toHaveBeenCalled()
  })
})
