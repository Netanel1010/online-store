import { useAuthStore } from '@/features/auth/authStore'
import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_TTL_MS,
  discardCheckoutDraftUnlessOf,
  forgetCheckoutDraft,
  peekCheckoutDraft,
  removeStaleCheckoutDraft,
  saveCheckoutDraft,
  startCheckoutDraftGuard,
} from './checkoutDraft'

const DETAILS = {
  fullName: 'נתנאל כהן',
  email: 'netanel@example.com',
  phone: '0501234567',
  city: 'תל אביב',
  street: 'דיזנגוף',
  houseNumber: '12',
  apartment: '4',
  postalCode: '6433101',
  notes: 'להתקשר לפני',
}
const NOW = 1_800_000_000_000
const USER = 'user-1'
const OTHER = 'user-2'

const stored = () => sessionStorage.getItem(CHECKOUT_DRAFT_KEY)
/** What a draft that this file wrote looks like, to be spoilt one way or another. */
const written = () =>
  JSON.parse(stored()!) as Record<string, unknown> & {
    details: Record<string, unknown>
  }
const put = (value: unknown) => sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(value))

beforeEach(() => {
  sessionStorage.clear()
})
afterEach(() => sessionStorage.clear())

describe('what is kept', () => {
  it('is the nine delivery fields, the account as a digest, the time and nothing else', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    const draft = written()
    expect(Object.keys(draft).sort()).toEqual(['details', 'owner', 'savedAt', 'version'])
    expect(draft.details).toEqual(DETAILS)
    expect(draft.savedAt).toBe(NOW)
    expect(stored()).not.toContain(USER)
  })

  it('does not keep what the form also holds: the demo tick, a token, a key of an attempt, a card', () => {
    // At run time the object that comes out of the form is wider than its type says.
    const wider = {
      ...DETAILS,
      acceptDemo: true,
      token: 'a-session-token-of-the-account',
      idempotencyKey: '6f1c0a52-5a39-4f7c-9a41-3d7a7e2e2b11',
      cardNumber: '4111111111111111',
      password: 'Passw0rdOK',
    }

    saveCheckoutDraft(USER, wider, NOW)

    const raw = stored()!
    for (const secret of [
      'acceptDemo',
      'a-session-token-of-the-account',
      '6f1c0a52',
      'cardNumber',
      '4111111111111111',
      'Passw0rdOK',
    ]) {
      expect(raw).not.toContain(secret)
    }
    expect(written().details).toEqual(DETAILS)
  })

  it('is kept in this tab only: nothing goes to localStorage', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    expect(localStorage.length).toBe(0)
  })

  it('replaces an earlier draft instead of adding to it', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)
    saveCheckoutDraft(USER, { ...DETAILS, city: 'חיפה' }, NOW + 1)

    expect(peekCheckoutDraft(USER, NOW + 2)?.city).toBe('חיפה')
    expect(sessionStorage.length).toBe(1)
  })
})

describe('what is given back', () => {
  it('is the details of the same account, as they were saved', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    expect(peekCheckoutDraft(USER, NOW + 1000)).toEqual(DETAILS)
  })

  it('does not use up the draft by looking: asking twice gives the same answer', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    expect(peekCheckoutDraft(USER, NOW)).toEqual(DETAILS)
    expect(peekCheckoutDraft(USER, NOW)).toEqual(DETAILS)
    expect(stored()).not.toBeNull()
  })

  it('is gone once it is forgotten, and forgetting twice is harmless', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    forgetCheckoutDraft()
    forgetCheckoutDraft()

    expect(peekCheckoutDraft(USER, NOW)).toBeNull()
    expect(stored()).toBeNull()
  })

  it('is nothing when nothing was saved', () => {
    expect(peekCheckoutDraft(USER, NOW)).toBeNull()
  })
})

describe('time', () => {
  it('is good for 30 minutes, to the millisecond', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    expect(CHECKOUT_DRAFT_TTL_MS).toBe(30 * 60 * 1000)
    expect(peekCheckoutDraft(USER, NOW + CHECKOUT_DRAFT_TTL_MS - 1)).toEqual(DETAILS)
    expect(peekCheckoutDraft(USER, NOW + CHECKOUT_DRAFT_TTL_MS)).toBeNull()
  })

  it('is not used when the clock went back since it was saved', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    expect(peekCheckoutDraft(USER, NOW - 1)).toBeNull()
  })

  it('an old draft is removed by the sweep, not only ignored', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    discardCheckoutDraftUnlessOf(USER, NOW + CHECKOUT_DRAFT_TTL_MS)

    expect(stored()).toBeNull()
  })
})

describe('another account', () => {
  it('does not get the details of the first, and the sweep removes them', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    expect(peekCheckoutDraft(OTHER, NOW)).toBeNull()
    discardCheckoutDraftUnlessOf(OTHER, NOW)

    expect(stored()).toBeNull()
    expect(peekCheckoutDraft(USER, NOW)).toBeNull()
  })

  it('the sweep leaves the draft of the account that is signed in', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)

    discardCheckoutDraftUnlessOf(USER, NOW)

    expect(peekCheckoutDraft(USER, NOW)).toEqual(DETAILS)
  })
})

describe('what is not a draft that this file wrote', () => {
  const good = () => {
    saveCheckoutDraft(USER, DETAILS, NOW)
    return written()
  }
  const control = (code: number) => String.fromCharCode(code)

  it.each([
    ['not JSON', () => sessionStorage.setItem(CHECKOUT_DRAFT_KEY, '{not json')],
    ['a string', () => put('details')],
    ['null', () => put(null)],
    ['an array', () => put([])],
    ['an empty object', () => put({})],
    ['another version', () => put({ ...good(), version: 2 })],
    ['no account', () => put({ ...good(), owner: '' })],
    ['a time that is not a number', () => put({ ...good(), savedAt: 'now' })],
    ['a time with a fraction', () => put({ ...good(), savedAt: NOW + 0.5 })],
    ['a field more in the record', () => put({ ...good(), acceptDemo: true })],
    ['a token in the record', () => put({ ...good(), token: 'abcdefghijklmnopqrstuvwxyz' })],
    [
      'a field more in the details',
      () => put({ ...good(), details: { ...DETAILS, acceptDemo: true } }),
    ],
    [
      'a card number in the details',
      () => put({ ...good(), details: { ...DETAILS, cardNumber: '4111111111111111' } }),
    ],
    [
      'a field less in the details',
      () => {
        const draft = good()
        delete draft.details.notes
        put(draft)
      },
    ],
    ['a number for a field', () => put({ ...good(), details: { ...DETAILS, phone: 501234567 } })],
    ['details that are not an object', () => put({ ...good(), details: 'x' })],
  ])('%s: not used, and removed by the sweep', (_what, spoil) => {
    spoil()

    expect(peekCheckoutDraft(USER, NOW)).toBeNull()
    discardCheckoutDraftUnlessOf(USER, NOW)
    expect(stored()).toBeNull()
  })

  it.each([
    ['a tab inside the street', { street: `דיזנגוף${control(9)}12` }],
    ['a line break inside the city', { city: `תל${control(10)}אביב` }],
    ['a control character at the end of the name', { fullName: `נתנאל כהן${control(1)}` }],
    ['a direction override in the name', { fullName: `נתנאל${control(0x202e)}כהן` }],
    ['a formula in the street', { street: '=SUM(A1)' }],
    ['a street with characters that are not part of a name', { street: 'דיזנגוף <b>' }],
    ['an email that is not an address', { email: 'not-an-address' }],
    ['an email with a trailing line break', { email: `netanel@example.com${control(10)}` }],
    ['a phone that is not a phone number', { phone: '12' }],
    ['a house number that is not one', { houseNumber: '0' }],
    ['notes over the limit', { notes: 'א'.repeat(301) }],
    ['a name over the work limit', { fullName: 'א'.repeat(600) }],
    ['a name with nothing in it', { fullName: '' }],
  ])('%s: the rules of an order refuse it, so it is not used and is removed', (_what, change) => {
    put({ ...good(), details: { ...DETAILS, ...change } })

    expect(peekCheckoutDraft(USER, NOW)).toBeNull()
    discardCheckoutDraftUnlessOf(USER, NOW)
    expect(stored()).toBeNull()
  })

  it('a draft that is good in every other way is used, so the cases above are about what they name', () => {
    put(good())

    expect(peekCheckoutDraft(USER, NOW)).toEqual(DETAILS)
  })

  it('an optional field may be empty', () => {
    saveCheckoutDraft(USER, { ...DETAILS, apartment: '', postalCode: '', notes: '' }, NOW)

    expect(peekCheckoutDraft(USER, NOW)).toEqual({
      ...DETAILS,
      apartment: '',
      postalCode: '',
      notes: '',
    })
  })

  it('details that the rules write another way are given back the way the rules write them', () => {
    // The spaces of a name are tidied, as they are in an order.
    put({ ...good(), details: { ...DETAILS, fullName: '  נתנאל   כהן ' } })

    expect(peekCheckoutDraft(USER, NOW)?.fullName).toBe('נתנאל כהן')
  })
})

describe('storage that does not work', () => {
  it('saving does not throw when the browser refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(() => saveCheckoutDraft(USER, DETAILS, NOW)).not.toThrow()
  })

  it('reading, forgetting and sweeping do not throw when storage cannot be used', () => {
    saveCheckoutDraft(USER, DETAILS, NOW)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(peekCheckoutDraft(USER, NOW)).toBeNull()
    expect(() => forgetCheckoutDraft()).not.toThrow()
    expect(() => discardCheckoutDraftUnlessOf(OTHER, NOW)).not.toThrow()
  })
})

describe('what is told to the console', () => {
  it('nothing, whether the draft is good, spoilt or somebody else is', () => {
    const calls = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    )

    saveCheckoutDraft(USER, DETAILS, NOW)
    peekCheckoutDraft(USER, NOW)
    peekCheckoutDraft(OTHER, NOW)
    sessionStorage.setItem(CHECKOUT_DRAFT_KEY, '{not json')
    peekCheckoutDraft(USER, NOW)
    discardCheckoutDraftUnlessOf(USER, NOW)

    for (const call of calls) expect(call).not.toHaveBeenCalled()
  })
})

describe('the guard that follows who is signed in', () => {
  const signedIn = (id: string) =>
    useAuthStore.setState({
      token: 'a-session-token-of-the-account',
      expiresAt: null,
      user: { id, name: 'x', email: 'x@example.com' },
      status: 'authenticated',
    })
  let stop: () => void = () => undefined
  afterEach(() => stop())

  it('removes the draft of an account when another one signs in', () => {
    saveCheckoutDraft(USER, DETAILS)
    stop = startCheckoutDraftGuard()

    signedIn(OTHER)

    expect(stored()).toBeNull()
  })

  it('keeps the draft when the same account signs in again', () => {
    saveCheckoutDraft(USER, DETAILS)
    stop = startCheckoutDraftGuard()

    signedIn(USER)

    expect(peekCheckoutDraft(USER)).toEqual(DETAILS)
  })

  it('keeps the draft while nobody is signed in: that is when it waits', () => {
    saveCheckoutDraft(USER, DETAILS)
    stop = startCheckoutDraftGuard()

    useAuthStore.setState({ token: null, expiresAt: null, user: null, status: 'anonymous' })

    expect(peekCheckoutDraft(USER)).toEqual(DETAILS)
  })

  it('sweeps at the start too, for an account that is already signed in as the site opens', () => {
    saveCheckoutDraft(USER, DETAILS)
    signedIn(OTHER)

    stop = startCheckoutDraftGuard()

    expect(stored()).toBeNull()
  })

  it('stops when told to', () => {
    saveCheckoutDraft(USER, DETAILS)
    stop = startCheckoutDraftGuard()
    stop()

    signedIn(OTHER)

    expect(stored()).not.toBeNull()
  })
})

describe('taking an old draft out of storage (cleaning; the age checked on a read is what decides)', () => {
  const TTL = CHECKOUT_DRAFT_TTL_MS
  let stop: () => void = () => undefined
  const timers = () => vi.getTimerCount()
  const pageIs = (state: DocumentVisibilityState) => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
    document.dispatchEvent(new Event('visibilitychange'))
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    stop()
    stop = () => undefined
    vi.useRealTimers()
  })

  describe('as the site opens', () => {
    it('removes an old draft with nobody signed in', () => {
      saveCheckoutDraft(USER, DETAILS, NOW - TTL - 1)
      expect(stored()).not.toBeNull()

      stop = startCheckoutDraftGuard()

      expect(stored()).toBeNull()
      expect(timers()).toBe(0)
    })

    it('removes a draft made at a time that has not come, as a read would refuse it', () => {
      saveCheckoutDraft(USER, DETAILS, NOW + 60_000)

      stop = startCheckoutDraftGuard()

      expect(stored()).toBeNull()
    })

    it('removes what is not a draft with nobody signed in', () => {
      sessionStorage.setItem(CHECKOUT_DRAFT_KEY, '{not json')

      stop = startCheckoutDraftGuard()

      expect(stored()).toBeNull()
    })

    it('keeps a good draft of any account with nobody signed in, and sets one timer for its end', () => {
      saveCheckoutDraft(USER, DETAILS, NOW - 1000)

      stop = startCheckoutDraftGuard()

      expect(peekCheckoutDraft(USER)).toEqual(DETAILS)
      expect(timers()).toBe(1)
    })

    it('sets no timer when there is no draft (nothing polls)', () => {
      stop = startCheckoutDraftGuard()

      expect(timers()).toBe(0)
      vi.advanceTimersByTime(3 * TTL)
      expect(timers()).toBe(0)
    })
  })

  describe('when the time of the draft is up', () => {
    it('removes it when its timer fires, and not a moment before', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      expect(timers()).toBe(1)

      vi.advanceTimersByTime(TTL - 1)
      expect(stored()).not.toBeNull()
      expect(peekCheckoutDraft(USER)).toEqual(DETAILS)

      vi.advanceTimersByTime(1)
      expect(stored()).toBeNull()
      expect(timers()).toBe(0)
    })

    it('sets the timer for the end of a draft that was there before the guard started', () => {
      saveCheckoutDraft(USER, DETAILS, NOW - 10 * 60 * 1000)

      stop = startCheckoutDraftGuard()
      vi.advanceTimersByTime(TTL - 10 * 60 * 1000 - 1)
      expect(stored()).not.toBeNull()
      vi.advanceTimersByTime(1)

      expect(stored()).toBeNull()
    })

    it('a timer that fires early removes nothing, and looks again for what is left', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      // The timer runs while the clock says that 5 seconds are left (a clock that was set back).
      const clock = vi.spyOn(Date, 'now').mockReturnValue(NOW + TTL - 5000)

      vi.advanceTimersByTime(TTL)

      expect(stored()).not.toBeNull()
      expect(peekCheckoutDraft(USER)).toEqual(DETAILS)
      expect(timers()).toBe(1)

      clock.mockRestore()
      vi.advanceTimersByTime(5000)

      expect(stored()).toBeNull()
      expect(timers()).toBe(0)
    })

    it('a newer draft is not removed by the timer of the one it replaced', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      vi.advanceTimersByTime(TTL - 1000)
      saveCheckoutDraft(USER, { ...DETAILS, city: 'חיפה' })
      expect(timers()).toBe(1)

      vi.advanceTimersByTime(1000) // the end of the first draft
      expect(peekCheckoutDraft(USER)?.city).toBe('חיפה')

      vi.advanceTimersByTime(TTL - 1000) // the end of the second
      expect(stored()).toBeNull()
    })

    it('a timer that finds the draft already gone does nothing', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      forgetCheckoutDraft()

      expect(() => vi.advanceTimersByTime(TTL)).not.toThrow()

      expect(stored()).toBeNull()
      expect(timers()).toBe(0)
    })
  })

  describe('when the page is shown again after the timer could not run', () => {
    /** The page was suspended: the clock went on, and the timer did not run. */
    function suspendedPastTheEnd() {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      vi.setSystemTime(NOW + TTL + 60_000)
      expect(stored()).not.toBeNull() // nothing has removed it yet
    }

    it('removes the old draft when the page becomes visible', () => {
      suspendedPastTheEnd()

      pageIs('visible')

      expect(stored()).toBeNull()
      expect(timers()).toBe(0)
    })

    it('leaves it while the page stays hidden: only being shown looks', () => {
      suspendedPastTheEnd()

      pageIs('hidden')

      expect(stored()).not.toBeNull()
    })

    it('removes nothing from a draft that is still good, and keeps its timer', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      vi.setSystemTime(NOW + 60_000)

      pageIs('visible')

      expect(peekCheckoutDraft(USER)).toEqual(DETAILS)
      expect(timers()).toBe(1)
    })

    it('stops looking when the guard is stopped: the timer and the listener are gone', () => {
      suspendedPastTheEnd()

      stop()
      stop = () => undefined
      expect(timers()).toBe(0)
      pageIs('visible')

      expect(stored()).not.toBeNull()
    })
  })

  describe('an old draft is never restored, whether or not anything has removed it', () => {
    it('with the guard running and its timer not yet run', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      vi.setSystemTime(NOW + TTL)

      expect(stored()).not.toBeNull()
      expect(peekCheckoutDraft(USER)).toBeNull()
    })

    it('with no guard at all', () => {
      saveCheckoutDraft(USER, DETAILS)
      vi.setSystemTime(NOW + TTL)

      expect(stored()).not.toBeNull()
      expect(peekCheckoutDraft(USER)).toBeNull()
    })

    it('and a good draft just before its end is restored', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)
      vi.setSystemTime(NOW + TTL - 1)

      expect(peekCheckoutDraft(USER)).toEqual(DETAILS)
    })
  })

  describe('stopping', () => {
    it('twice counts one guard out once: a guard started after still sets its timer', () => {
      const first = startCheckoutDraftGuard()
      first()
      first()

      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)

      expect(timers()).toBe(1)
    })

    it('one of two guards stopping leaves the timer of the other', () => {
      const first = startCheckoutDraftGuard()
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)

      first()

      expect(timers()).toBe(1)
    })
  })

  describe('removeStaleCheckoutDraft', () => {
    it('says how long a good draft has left, and removes nothing', () => {
      saveCheckoutDraft(USER, DETAILS, NOW - 1000)

      expect(removeStaleCheckoutDraft(NOW)).toBe(TTL - 1000)
      expect(stored()).not.toBeNull()
    })

    it('removes an old one, and says there is none', () => {
      saveCheckoutDraft(USER, DETAILS, NOW - TTL)

      expect(removeStaleCheckoutDraft(NOW)).toBeNull()
      expect(stored()).toBeNull()
    })

    it('says there is none when storage cannot be read, and does not throw', () => {
      saveCheckoutDraft(USER, DETAILS)
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })

      expect(removeStaleCheckoutDraft(NOW)).toBeNull()
    })
  })

  describe('what stays as it was', () => {
    it('another account that signs in still removes the draft at once', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)

      useAuthStore.setState({
        token: 'a-session-token-of-the-account',
        expiresAt: null,
        user: { id: OTHER, name: 'x', email: 'x@example.com' },
        status: 'authenticated',
      })

      expect(stored()).toBeNull()
      expect(timers()).toBe(1) // a reminder to look; it finds nothing and ends
      vi.advanceTimersByTime(TTL)
      expect(timers()).toBe(0)
    })

    it('forgetting the draft (as signing out does) removes it, with the guard running', () => {
      stop = startCheckoutDraftGuard()
      saveCheckoutDraft(USER, DETAILS)

      forgetCheckoutDraft()

      expect(stored()).toBeNull()
      expect(peekCheckoutDraft(USER)).toBeNull()
    })
  })
})
