import {
  forgetAllCheckoutAttempts,
  forgetCheckoutAttempt,
  idempotencyKeyFor,
  unresolvedAttemptKey,
} from './checkoutAttempt'

const STORAGE_KEY = 'online-store:checkout-attempt'
const DAY = 24 * 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// What this page remembers when storage is blocked outlives a test: start each one without it.
afterEach(() => forgetAllCheckoutAttempts())

describe('idempotencyKeyFor', () => {
  it('makes a UUID, and keeps it in localStorage', () => {
    const key = idempotencyKeyFor('user-1')

    expect(key).toMatch(UUID)
    expect(localStorage.getItem(STORAGE_KEY)).toContain(key)
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

  it('keeps the unresolved attempt of each account: coming back gives the first account its own key', () => {
    const first = idempotencyKeyFor('user-1')
    const second = idempotencyKeyFor('user-2')

    expect(idempotencyKeyFor('user-1')).toBe(first)
    expect(idempotencyKeyFor('user-2')).toBe(second)
    expect(unresolvedAttemptKey('user-1')).toBe(first)
    expect(unresolvedAttemptKey('user-2')).toBe(second)
  })

  it('keeps each account attempt after a reload', () => {
    const first = idempotencyKeyFor('user-1')
    const second = idempotencyKeyFor('user-2')
    const stored = localStorage.getItem(STORAGE_KEY)

    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, stored!)

    expect(idempotencyKeyFor('user-1')).toBe(first)
    expect(idempotencyKeyFor('user-2')).toBe(second)
  })

  it('forgets a key after a day, as nobody retries after that long', () => {
    const start = 1_700_000_000_000
    const first = idempotencyKeyFor('user-1', start)

    expect(idempotencyKeyFor('user-1', start + DAY - 1)).toBe(first)
    expect(idempotencyKeyFor('user-1', start + DAY)).not.toBe(first)
  })

  it('lets one account attempt expire without touching the other', () => {
    const start = 1_700_000_000_000
    const first = idempotencyKeyFor('user-1', start)
    const second = idempotencyKeyFor('user-2', start + DAY / 2)

    expect(unresolvedAttemptKey('user-1', start + DAY)).toBeNull()
    expect(unresolvedAttemptKey('user-2', start + DAY)).toBe(second)
    expect(idempotencyKeyFor('user-1', start + DAY)).not.toBe(first)
    expect(unresolvedAttemptKey('user-2', start + DAY)).toBe(second)
  })

  it('drops attempts that have expired when it writes, and keeps the others', () => {
    const start = 1_700_000_000_000
    idempotencyKeyFor('old-user', start)
    const recent = idempotencyKeyFor('recent-user', start + DAY / 2)

    idempotencyKeyFor('new-user', start + DAY + 1)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as {
      attempts: Record<string, { key: string }>
    }
    expect(Object.keys(stored.attempts)).toHaveLength(2)
    expect(JSON.stringify(stored)).toContain(recent)
  })

  it('keeps at most ten accounts, the newest, so storage cannot grow without end', () => {
    const start = 1_700_000_000_000
    const keys = Array.from({ length: 12 }, (_, index) =>
      idempotencyKeyFor(`user-${index}`, start + index),
    )

    const now = start + 100
    expect(unresolvedAttemptKey('user-0', now)).toBeNull()
    expect(unresolvedAttemptKey('user-1', now)).toBeNull()
    expect(unresolvedAttemptKey('user-2', now)).toBe(keys[2])
    expect(unresolvedAttemptKey('user-11', now)).toBe(keys[11])
  })

  it.each([
    ['not JSON', 'oops'],
    [
      'an object of the wrong shape',
      JSON.stringify({ attempts: { x: { key: 'short', createdAt: 1 } } }),
    ],
    ['attempts that are not an object', JSON.stringify({ attempts: [1, 2] })],
    [
      'a record of the earlier kind, tied to the details of one order',
      JSON.stringify({ key: 'k'.repeat(36), fingerprint: 'abc', createdAt: Date.now() }),
    ],
    [
      'a record of the single-attempt kind',
      JSON.stringify({ key: 'k'.repeat(36), owner: 'abc', createdAt: Date.now() }),
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
    const second = idempotencyKeyFor('user-2')

    expect(first).toMatch(UUID)
    expect(idempotencyKeyFor('user-1')).toBe(first)
    expect(idempotencyKeyFor('user-2')).toBe(second)
    expect(second).not.toBe(first)
  })

  it('repeats the keys in the same page when storage can be read but not written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })

    const first = idempotencyKeyFor('user-1')
    const second = idempotencyKeyFor('user-2')

    expect(idempotencyKeyFor('user-1')).toBe(first)
    expect(unresolvedAttemptKey('user-1')).toBe(first)
    expect(unresolvedAttemptKey('user-2')).toBe(second)
  })

  describe('when storage holds an earlier attempt and then refuses to be written', () => {
    /** An attempt of user-1 is in storage; from now on writing to storage fails but reading works. */
    function storageThatCannotBeWrittenAnyMore() {
      const first = idempotencyKeyFor('user-1')
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('full')
      })
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('full')
      })
      return first
    }

    it('keeps the new key stable when reads still succeed with the old copy', () => {
      const earlier = storageThatCannotBeWrittenAnyMore()

      const fresh = idempotencyKeyFor('user-2')

      expect(fresh).not.toBe(earlier)
      expect(idempotencyKeyFor('user-2')).toBe(fresh)
      expect(idempotencyKeyFor('user-2')).toBe(fresh)
      expect(unresolvedAttemptKey('user-2')).toBe(fresh)
    })

    it('keeps the earlier attempt too, with the same key', () => {
      const earlier = storageThatCannotBeWrittenAnyMore()

      idempotencyKeyFor('user-2')

      expect(idempotencyKeyFor('user-1')).toBe(earlier)
      expect(unresolvedAttemptKey('user-1')).toBe(earlier)
    })

    it('does not bring back an attempt that was forgotten after the write failed', () => {
      const earlier = storageThatCannotBeWrittenAnyMore()

      forgetCheckoutAttempt('user-1')

      expect(unresolvedAttemptKey('user-1')).toBeNull()
      expect(idempotencyKeyFor('user-1')).not.toBe(earlier)
    })

    it('brings storage up to date with the page once a write works again', () => {
      const earlier = storageThatCannotBeWrittenAnyMore()
      const fresh = idempotencyKeyFor('user-2')
      vi.restoreAllMocks()

      const third = idempotencyKeyFor('user-3')

      const stored = localStorage.getItem(STORAGE_KEY)!
      for (const key of [earlier, fresh, third]) expect(stored).toContain(key)
      expect(unresolvedAttemptKey('user-2')).toBe(fresh)
    })
  })

  it('keeps no name, phone number, address or account in storage, only digests of the accounts', () => {
    idempotencyKeyFor('user-1')
    idempotencyKeyFor('user-2')

    const raw = localStorage.getItem(STORAGE_KEY)!
    expect(raw).not.toContain('user-1')
    expect(raw).not.toContain('user-2')
    const stored = JSON.parse(raw)
    expect(Object.keys(stored)).toEqual(['attempts'])
    expect(Object.keys(stored.attempts)).toHaveLength(2)
    for (const [owner, attempt] of Object.entries(stored.attempts)) {
      expect(owner).toMatch(/^[0-9a-z]{1,11}$/)
      expect(Object.keys(attempt as object).sort()).toEqual(['createdAt', 'key'])
    }
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

  it('is null for an account that has no attempt of its own', () => {
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
  it('makes the next order of that account a new one', () => {
    const first = idempotencyKeyFor('user-1')

    forgetCheckoutAttempt('user-1')

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(unresolvedAttemptKey('user-1')).toBeNull()
    expect(idempotencyKeyFor('user-1')).not.toBe(first)
  })

  it('forgets only the attempt of the account that was resolved', () => {
    idempotencyKeyFor('user-1')
    const second = idempotencyKeyFor('user-2')

    forgetCheckoutAttempt('user-1')

    expect(unresolvedAttemptKey('user-1')).toBeNull()
    expect(unresolvedAttemptKey('user-2')).toBe(second)
    expect(idempotencyKeyFor('user-2')).toBe(second)
  })

  it('does nothing for an account with no attempt', () => {
    const first = idempotencyKeyFor('user-1')

    forgetCheckoutAttempt('user-2')

    expect(unresolvedAttemptKey('user-1')).toBe(first)
  })

  it('forgets what the page remembered when storage could not be used', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const first = idempotencyKeyFor('user-1')
    const second = idempotencyKeyFor('user-2')

    forgetCheckoutAttempt('user-1')

    expect(idempotencyKeyFor('user-1')).not.toBe(first)
    expect(idempotencyKeyFor('user-2')).toBe(second)
  })

  it('does not throw when there is no storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    idempotencyKeyFor('user-1')

    expect(() => forgetCheckoutAttempt('user-1')).not.toThrow()
    expect(() => forgetCheckoutAttempt('nobody')).not.toThrow()
  })
})
