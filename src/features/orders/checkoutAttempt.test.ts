import { forgetCheckoutAttempt, idempotencyKeyFor } from './checkoutAttempt'

const STORAGE_KEY = 'online-store:checkout-attempt'
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
const ITEMS = [
  { productId: 'A-1', quantity: 2 },
  { productId: 'B-2', quantity: 1 },
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('idempotencyKeyFor', () => {
  it('makes a UUID, and keeps it in localStorage', () => {
    const key = idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    expect(key).toMatch(UUID)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ key })
  })

  it('gives the same key to the same order, however many times it is asked', () => {
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).toBe(first)
    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).toBe(first)
  })

  it('gives the same key when the products are listed in another order', () => {
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    expect(idempotencyKeyFor('user-1', [...ITEMS].reverse(), DELIVERY)).toBe(first)
  })

  it.each([
    ['another account', () => idempotencyKeyFor('user-2', ITEMS, DELIVERY)],
    [
      'another quantity',
      () => idempotencyKeyFor('user-1', [{ productId: 'A-1', quantity: 3 }, ITEMS[1]!], DELIVERY),
    ],
    ['another product', () => idempotencyKeyFor('user-1', [ITEMS[0]!], DELIVERY)],
    ['another address', () => idempotencyKeyFor('user-1', ITEMS, { ...DELIVERY, city: 'תל אביב' })],
    [
      'other notes',
      () => idempotencyKeyFor('user-1', ITEMS, { ...DELIVERY, notes: 'בבקשה לצלצל' }),
    ],
  ])('gives %s a key of its own, so the API never sees one key for two orders', (_name, other) => {
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    const second = other()

    expect(second).not.toBe(first)
    expect(second).toMatch(UUID)
  })

  it('keeps only the latest attempt: going back to an earlier order gives it a new key', () => {
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY)
    idempotencyKeyFor('user-1', [ITEMS[0]!], DELIVERY)

    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).not.toBe(first)
  })

  it('forgets a key after a day, as nobody retries after that long', () => {
    const start = 1_700_000_000_000
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY, start)

    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY, start + 24 * 60 * 60 * 1000 - 1)).toBe(
      first,
    )
    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY, start + 24 * 60 * 60 * 1000)).not.toBe(
      first,
    )
  })

  it('survives a reload: a fresh call finds the key in storage', () => {
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY)
    const stored = localStorage.getItem(STORAGE_KEY)

    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, stored!)

    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).toBe(first)
  })

  it.each([
    ['not JSON', 'oops'],
    [
      'an object of the wrong shape',
      JSON.stringify({ key: 'short', fingerprint: 'x', createdAt: 1 }),
    ],
    ['a list', JSON.stringify([1, 2])],
    ['null', 'null'],
  ])('ignores stored data that is %s, and makes a key', (_name, stored) => {
    localStorage.setItem(STORAGE_KEY, stored)

    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).toMatch(UUID)
  })

  it('still makes a key when localStorage cannot be used', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })

    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).toMatch(UUID)
  })

  it('does not keep the delivery details readable in storage beyond what the key needs to compare', () => {
    idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'fingerprint', 'key'])
  })
})

describe('forgetCheckoutAttempt', () => {
  it('makes the next order a new one', () => {
    const first = idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    forgetCheckoutAttempt()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY)).not.toBe(first)
  })

  it('does nothing, and does not throw, when there is nothing to forget or no storage', () => {
    expect(() => forgetCheckoutAttempt()).not.toThrow()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => forgetCheckoutAttempt()).not.toThrow()
  })
})
