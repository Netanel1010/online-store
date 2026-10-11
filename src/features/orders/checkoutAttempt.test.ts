import {
  fingerprintOf,
  forgetCheckoutAttempt,
  idempotencyKeyFor,
  markAttemptPending,
  markAttemptSettled,
  readPendingAttempt,
} from './checkoutAttempt'

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

  it('keeps no name, phone number, address or account in storage, only a digest of them', () => {
    idempotencyKeyFor('user-1', ITEMS, DELIVERY)

    const raw = localStorage.getItem(STORAGE_KEY)!
    for (const secret of [
      'נתנאל',
      'netanel@example.com',
      '050-1234567',
      'חיפה',
      'הנשיא',
      'user-1',
    ]) {
      expect(raw).not.toContain(secret)
    }
    const stored = JSON.parse(raw)
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'fingerprint', 'key'])
    expect(stored.fingerprint).toMatch(/^[0-9a-z]{1,11}$/)
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

describe('an attempt whose outcome is not known', () => {
  const START = 1_700_000_000_000

  it('is not pending until a request is sent, and has no pending time in storage', () => {
    idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)

    expect(readPendingAttempt(START)).toBeNull()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).not.toHaveProperty('pendingSince')
  })

  it('is pending, with its key, its fingerprint and the time, once a request was sent', () => {
    const key = idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)

    markAttemptPending(START + 5)

    expect(readPendingAttempt(START + 10)).toEqual({
      key,
      fingerprint: fingerprintOf('user-1', ITEMS, DELIVERY),
      since: START + 5,
    })
  })

  it('moves its time on when the answer is lost again, so the wait counts from the last try', () => {
    idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)
    markAttemptPending(START)

    markAttemptPending(START + 60_000)

    expect(readPendingAttempt(START + 60_001)?.since).toBe(START + 60_000)
  })

  it('stays pending through a reload: a fresh call finds it in storage', () => {
    const key = idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)
    markAttemptPending(START)
    const stored = localStorage.getItem(STORAGE_KEY)

    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, stored!)

    expect(readPendingAttempt(START)?.key).toBe(key)
  })

  it('is settled when the API says it made no order: the key stays, nothing is pending', () => {
    const key = idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)
    markAttemptPending(START)

    markAttemptSettled()

    expect(readPendingAttempt(START)).toBeNull()
    expect(idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)).toBe(key)
  })

  it('is forgotten with the key, and after a day like the key', () => {
    idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)
    markAttemptPending(START)
    const day = 24 * 60 * 60 * 1000

    expect(readPendingAttempt(START + day - 1)).not.toBeNull()
    expect(readPendingAttempt(START + day)).toBeNull()
    forgetCheckoutAttempt()
    expect(readPendingAttempt(START)).toBeNull()
  })

  it('reads a record from before pending existed as settled', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: 'k'.repeat(36), fingerprint: 'abc', createdAt: START }),
    )

    expect(readPendingAttempt(START)).toBeNull()
  })

  it.each([
    ['a pending time that is not a number', { pendingSince: 'soon' }],
    ['a fractional pending time', { pendingSince: 1.5 }],
  ])('ignores a record with %s', (_name, extra) => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: 'k'.repeat(36), fingerprint: 'abc', createdAt: START, ...extra }),
    )

    expect(readPendingAttempt(START)).toBeNull()
  })

  it('does nothing, and does not throw, when there is no attempt or no storage', () => {
    expect(() => markAttemptPending(START)).not.toThrow()
    expect(() => markAttemptSettled()).not.toThrow()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readPendingAttempt(START)).toBeNull()
    expect(() => markAttemptPending(START)).not.toThrow()
  })

  it('keeps the same digest-only storage: no detail of the order is added by being pending', () => {
    idempotencyKeyFor('user-1', ITEMS, DELIVERY, START)
    markAttemptPending(START)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'fingerprint', 'key', 'pendingSince'])
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('050-1234567')
  })
})
