import { useAuthStore } from '@/features/auth/authStore'
import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_DRAFT_TTL_MS,
  discardCheckoutDraftUnlessOf,
  forgetCheckoutDraft,
  peekCheckoutDraft,
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
