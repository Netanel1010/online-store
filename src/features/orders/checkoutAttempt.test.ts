import { forgetCheckoutAttempt, idempotencyKeyFor, unresolvedAttemptKey } from './checkoutAttempt'

const STORAGE_KEY = 'online-store:checkout-attempt'
const DAY = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// What this page remembers when storage is blocked outlives a test: start each one without it.
afterEach(() => forgetCheckoutAttempt())

describe('idempotencyKeyFor', () => {
  it('makes a UUID, and keeps it in localStorage', () => {
    const key = idempotencyKeyFor('user-1')

    expect(key).toMatch(UUID)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ key })
  })

  it('gives the same key to the same unresolved attempt, however many times it is asked', () => {
    const first = idempotencyKeyFor('user-1')

    expect(idempotencyKeyFor('user-1')).toBe(first)
    expect(idempotencyKeyFor('user-1')).toBe(first)
  })

  it('gives another account a key of its own, so one account never sends the key of another', () => {
    const first = idempotencyKeyFor('user-1')

    const second = idempotencyKeyFor('user-2')

    expect(second).not.toBe(first)
    expect(second).toMatch(UUID)
  })

  it('keeps only the latest attempt: going back to the first account gives it a new key', () => {
    const first = idempotencyKeyFor('user-1')
    idempotencyKeyFor('user-2')

    expect(idempotencyKeyFor('user-1')).not.toBe(first)
  })

  it('forgets a key after a day, as nobody retries after that long', () => {
    const start = 1_700_000_000_000
    const first = idempotencyKeyFor('user-1', start)

    expect(idempotencyKeyFor('user-1', start + DAY - 1)).toBe(first)
    expect(idempotencyKeyFor('user-1', start + DAY)).not.toBe(first)
  })

  it('survives a reload: a fresh call finds the key in storage', () => {
    const first = idempotencyKeyFor('user-1')
    const stored = localStorage.getItem(STORAGE_KEY)

    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, stored!)

    expect(idempotencyKeyFor('user-1')).toBe(first)
  })

  it.each([
    ['not JSON', 'oops'],
    ['an object of the wrong shape', JSON.stringify({ key: 'short', owner: 'x', createdAt: 1 })],
    [
      'a record of the earlier kind, tied to the details of one order',
      JSON.stringify({ key: 'k'.repeat(36), fingerprint: 'abc', createdAt: Date.now() }),
    ],
    ['a list', JSON.stringify([1, 2])],
    ['null', 'null'],
  ])('ignores stored data that is %s, and makes a key', (_name, stored) => {
    localStorage.setItem(STORAGE_KEY, stored)

    expect(idempotencyKeyFor('user-1')).toMatch(UUID)
  })

  it('still makes a key, and repeats it in the same page, when localStorage cannot be used at all', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })

    const first = idempotencyKeyFor('user-1')

    expect(first).toMatch(UUID)
    expect(idempotencyKeyFor('user-1')).toBe(first)
  })

  it('repeats the key in the same page when storage can be read but not written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })

    const first = idempotencyKeyFor('user-1')

    expect(idempotencyKeyFor('user-1')).toBe(first)
    expect(unresolvedAttemptKey('user-1')).toBe(first)
  })

  it('keeps no name, phone number, address or account in storage, only a digest of the account', () => {
    idempotencyKeyFor('user-1')

    const raw = localStorage.getItem(STORAGE_KEY)!
    expect(raw).not.toContain('user-1')
    const stored = JSON.parse(raw)
    expect(Object.keys(stored).sort()).toEqual(['createdAt', 'key', 'owner'])
    expect(stored.owner).toMatch(/^[0-9a-z]{1,11}$/)
  })
})

describe('unresolvedAttemptKey', () => {
  it('is null when nothing was ever sent, and makes nothing', () => {
    expect(unresolvedAttemptKey('user-1')).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('is the key of the attempt that was started', () => {
    const key = idempotencyKeyFor('user-1')

    expect(unresolvedAttemptKey('user-1')).toBe(key)
  })

  it('is null for another account', () => {
    idempotencyKeyFor('user-1')

    expect(unresolvedAttemptKey('user-2')).toBeNull()
  })

  it('is null after a day', () => {
    const start = 1_700_000_000_000
    idempotencyKeyFor('user-1', start)

    expect(unresolvedAttemptKey('user-1', start + DAY - 1)).not.toBeNull()
    expect(unresolvedAttemptKey('user-1', start + DAY)).toBeNull()
  })

  it('is null for stored data that is not an attempt', () => {
    localStorage.setItem(STORAGE_KEY, 'oops')

    expect(unresolvedAttemptKey('user-1')).toBeNull()
  })
})

describe('forgetCheckoutAttempt', () => {
  it('makes the next order a new one', () => {
    const first = idempotencyKeyFor('user-1')

    forgetCheckoutAttempt()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(unresolvedAttemptKey('user-1')).toBeNull()
    expect(idempotencyKeyFor('user-1')).not.toBe(first)
  })

  it('forgets what the page remembered when storage could not be used', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const first = idempotencyKeyFor('user-1')

    forgetCheckoutAttempt()

    expect(idempotencyKeyFor('user-1')).not.toBe(first)
  })

  it('does nothing, and does not throw, when there is nothing to forget or no storage', () => {
    expect(() => forgetCheckoutAttempt()).not.toThrow()
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => forgetCheckoutAttempt()).not.toThrow()
  })
})
