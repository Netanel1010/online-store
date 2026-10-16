import { useAuthStore } from '@/features/auth/authStore'
import { digest } from '@/features/orders/checkoutAttempt'
import {
  FAVORITES_KEY_PREFIX,
  GUEST,
  LEGACY_FAVORITES_KEY,
  MAX_ACCOUNT_LISTS,
  MAX_FAVORITES,
  SIGNED_IN_AS_KEY,
  ownerOfAccount,
  selectIsFavorite,
  startFavoritesOwner,
  useFavoritesStore,
} from './favoritesStore'

const state = () => useFavoritesStore.getState()
const GUEST_KEY = `${FAVORITES_KEY_PREFIX}guest`
const accountKey = (userId: string) => `${FAVORITES_KEY_PREFIX}${ownerOfAccount(userId)}`
const stored = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null')
const idsIn = (key: string) => (stored(key) as { ids: string[] } | null)?.ids ?? null

const user = (id: string) => ({ id, name: `Name of ${id}`, email: `${id}@example.com` })
const TOKEN = 'a-session-token-of-the-account'

function signIn(id: string) {
  useAuthStore.setState({ token: TOKEN, expiresAt: null, user: user(id), status: 'authenticated' })
}
/** What signing out, and a session the API no longer knows, both come to: no token, nobody. */
function signOut() {
  useAuthStore.setState({ token: null, expiresAt: null, user: null, status: 'anonymous' })
}

let stop: () => void = () => undefined
afterEach(() => {
  stop()
  stop = () => undefined
  vi.restoreAllMocks()
})

describe('the favorites of the guest', () => {
  it('toggles a product on and off', () => {
    state().toggle('A')
    expect(selectIsFavorite('A')(state())).toBe(true)

    state().toggle('A')
    expect(selectIsFavorite('A')(state())).toBe(false)
  })

  it('keeps the order in which products were added', () => {
    state().toggle('B')
    state().toggle('A')

    expect(state().ids).toEqual(['B', 'A'])
  })

  it('removes a product and ignores unknown ids', () => {
    state().toggle('A')
    state().remove('nope')
    state().remove('A')

    expect(state().ids).toEqual([])
  })

  it('drops products that no longer exist', () => {
    state().toggle('A')
    state().toggle('GONE')
    state().retainOnly(new Set(['A']))

    expect(state().ids).toEqual(['A'])
  })

  it('clears all favorites', () => {
    state().toggle('A')
    state().clear()

    expect(state().ids).toEqual([])
  })

  it('is the list of nobody in particular until someone signs in', () => {
    expect(state().owner).toBe(GUEST)
  })
})

describe('what is kept in the browser', () => {
  it('is the product ids of this person, in a key of their own, with the time of the last use', () => {
    state().toggle('GP-P650G')

    expect(stored(GUEST_KEY)).toEqual({ version: 1, ids: ['GP-P650G'], usedAt: expect.any(Number) })
    expect(localStorage.getItem(LEGACY_FAVORITES_KEY)).toBeNull()
  })

  it('leaves nothing behind for an empty list', () => {
    state().toggle('A')
    state().toggle('A')

    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('starts a change from what the browser keeps, so that a change made by another tab is not lost', () => {
    state().toggle('A')
    // Another tab of the same person adds B.
    localStorage.setItem(GUEST_KEY, JSON.stringify({ version: 1, ids: ['A', 'B'], usedAt: 1 }))

    state().toggle('C')

    expect(state().ids).toEqual(['A', 'B', 'C'])
    expect(idsIn(GUEST_KEY)).toEqual(['A', 'B', 'C'])
  })

  it(`holds at most ${MAX_FAVORITES} products: when it is full, the one added first is let go`, () => {
    for (let n = 1; n <= MAX_FAVORITES; n += 1) state().toggle(`P-${n}`)
    expect(state().ids).toHaveLength(MAX_FAVORITES)

    state().toggle('NEW')

    expect(state().ids).toHaveLength(MAX_FAVORITES)
    expect(state().ids[0]).toBe('P-2')
    expect(state().ids.at(-1)).toBe('NEW')
    expect(idsIn(GUEST_KEY)).toEqual(state().ids)
  })

  it('reads at most the newest products of a list that is longer than that, without duplicates', () => {
    const ids = Array.from({ length: MAX_FAVORITES + 20 }, (_, n) => `P-${n}`)
    localStorage.setItem(GUEST_KEY, JSON.stringify({ version: 1, ids: [...ids, 'P-0'], usedAt: 1 }))

    state().toggle('NEW')

    expect(state().ids).toHaveLength(MAX_FAVORITES)
    expect(new Set(state().ids).size).toBe(MAX_FAVORITES)
    expect(state().ids.at(-1)).toBe('NEW')
  })

  it.each([
    ['text that is not JSON', '{not json'],
    ['null', 'null'],
    ['an array', '[]'],
    ['ids that are not strings', JSON.stringify({ version: 1, ids: [1, 2], usedAt: 1 })],
    ['an empty id', JSON.stringify({ version: 1, ids: [''], usedAt: 1 })],
    ['ids that are not a list', JSON.stringify({ version: 1, ids: 'A', usedAt: 1 })],
    ['no ids', JSON.stringify({ version: 1, usedAt: 1 })],
    ['another version', JSON.stringify({ version: 2, ids: ['A'], usedAt: 1 })],
    ['no time', JSON.stringify({ version: 1, ids: ['A'] })],
    ['a time that is not a number', JSON.stringify({ version: 1, ids: ['A'], usedAt: 'now' })],
  ])('treats %s as an empty list, and removes it', (_what, value) => {
    localStorage.setItem(GUEST_KEY, value)

    state().toggle('NEW')

    expect(state().ids).toEqual(['NEW'])
    expect(idsIn(GUEST_KEY)).toEqual(['NEW'])
  })

  it('removes a spoilt list that is only looked at', () => {
    localStorage.setItem(GUEST_KEY, '{not json')

    state().retainOnly(new Set())
    state().remove('A')

    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
  })
})

describe('when storage cannot be used', () => {
  /** Writing and removing fail for the favorites only: the session of the account is stored as always. */
  function refuseToWrite(name: string) {
    type Write = (this: Storage, key: string, value?: string) => void
    const originals = {
      setItem: Storage.prototype.setItem as Write,
      removeItem: Storage.prototype.removeItem as Write,
    }
    for (const method of ['setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(function (
        this: Storage,
        key: string,
        value?: string,
      ) {
        if (key.startsWith('online-store:favorites')) throw new DOMException('refused', name)
        originals[method].call(this, key, value)
      } as Write)
    }
  }

  it('keeps working from memory when it cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => state().toggle('A')).not.toThrow()
    expect(state().ids).toEqual(['A'])
    state().toggle('B')
    expect(state().ids).toEqual(['A', 'B'])
  })

  it('keeps the lists of the guest and of an account apart when it cannot be written', () => {
    refuseToWrite('QuotaExceededError')
    stop = startFavoritesOwner()

    state().toggle('GUEST-ONLY')
    signIn('user-a')
    expect(state().ids).toEqual([])
    state().toggle('A-ONLY')
    signOut()
    expect(state().ids).toEqual(['GUEST-ONLY'])
    signIn('user-b')
    expect(state().ids).toEqual([])
    signOut()
    signIn('user-a')

    expect(state().ids).toEqual(['A-ONLY'])
  })

  it('does not throw when nothing can be removed or written', () => {
    refuseToWrite('SecurityError')
    stop = startFavoritesOwner()

    expect(() => {
      state().toggle('A')
      signIn('user-a')
      signOut()
    }).not.toThrow()
  })
})

describe('who the list belongs to', () => {
  beforeEach(() => {
    stop = startFavoritesOwner()
  })

  it('shows an account its own list, and the guest the guest list: nobody sees the list of another', () => {
    state().toggle('GUEST-1')
    signIn('user-a')
    expect(state().ids).toEqual([])
    state().toggle('A-1')

    signOut()
    expect(state().ids).toEqual(['GUEST-1'])
    signIn('user-b')
    expect(state().ids).toEqual([])
    state().toggle('B-1')

    signOut()
    signIn('user-a')
    expect(state().ids).toEqual(['A-1'])
    signOut()
    signIn('user-b')
    expect(state().ids).toEqual(['B-1'])
  })

  it('never puts the list of the guest into an account, nor the list of an account into the guest list', () => {
    state().toggle('GUEST-1')
    signIn('user-a')
    state().toggle('A-1')
    signOut()

    expect(idsIn(GUEST_KEY)).toEqual(['GUEST-1'])
    expect(idsIn(accountKey('user-a'))).toEqual(['A-1'])
    signIn('user-a')
    expect(state().ids).toEqual(['A-1'])
  })

  it('shows the account its list again after a session that ended: it was never let go', () => {
    signIn('user-a')
    state().toggle('A-1')

    // The API answers 401 and the page signs out: no token, no account.
    signOut()
    expect(state().ids).toEqual([])
    expect(idsIn(accountKey('user-a'))).toEqual(['A-1'])
    signIn('user-a')

    expect(state().ids).toEqual(['A-1'])
  })

  it('writes the changes of a person to that person, wherever the page believes they are', () => {
    signIn('user-a')
    state().toggle('A-1')
    signOut()
    signIn('user-b')
    state().toggle('B-1')

    expect(idsIn(accountKey('user-a'))).toEqual(['A-1'])
    expect(idsIn(accountKey('user-b'))).toEqual(['B-1'])
    expect(idsIn(GUEST_KEY)).toBeNull()
  })

  it('keeps the id of the account out of storage', () => {
    signIn('a-secret-account-id-12345')
    state().toggle('A-1')

    const everything = JSON.stringify({ ...localStorage })
    expect(everything).not.toContain('a-secret-account-id-12345')
    expect(everything).toContain(digest('a-secret-account-id-12345'))
  })

  it('remembers which account is signed in, and forgets it when nobody is', () => {
    signIn('user-a')
    expect(localStorage.getItem(SIGNED_IN_AS_KEY)).toBe(ownerOfAccount('user-a'))

    signOut()

    expect(localStorage.getItem(SIGNED_IN_AS_KEY)).toBeNull()
  })

  it('changes nothing for a stored session that the API has not answered for', () => {
    signIn('user-a')
    state().toggle('A-1')

    // A reload: the session is stored, who it belongs to is being asked.
    useAuthStore.setState({ token: TOKEN, user: null, status: 'restoring' })
    expect(state().ids).toEqual(['A-1'])
    useAuthStore.setState({ status: 'unavailable' })
    expect(state().ids).toEqual(['A-1'])

    useAuthStore.setState({ user: user('user-a'), status: 'authenticated' })
    expect(state().ids).toEqual(['A-1'])
  })

  it('lets go of the oldest accounts when there are more than the browser keeps, never the one in use', () => {
    const now = vi.spyOn(Date, 'now')
    for (let n = 1; n <= MAX_ACCOUNT_LISTS + 2; n += 1) {
      now.mockReturnValue(1_000_000 + n * 1000)
      signIn(`user-${n}`)
      state().toggle(`FAV-${n}`)
    }

    const accountKeys = Object.keys(localStorage).filter((key) => key.includes(':account:'))
    expect(accountKeys).toHaveLength(MAX_ACCOUNT_LISTS)
    expect(localStorage.getItem(accountKey('user-1'))).toBeNull()
    expect(localStorage.getItem(accountKey('user-2'))).toBeNull()
    expect(idsIn(accountKey(`user-${MAX_ACCOUNT_LISTS + 2}`))).toEqual([
      `FAV-${MAX_ACCOUNT_LISTS + 2}`,
    ])
  })

  it('does not count the guest among the accounts that are limited', () => {
    state().toggle('GUEST-1')
    for (let n = 1; n <= MAX_ACCOUNT_LISTS + 1; n += 1) {
      signIn(`user-${n}`)
      state().toggle(`FAV-${n}`)
    }

    expect(idsIn(GUEST_KEY)).toEqual(['GUEST-1'])
  })
})

describe('other tabs of the same browser', () => {
  beforeEach(() => {
    stop = startFavoritesOwner()
  })

  const otherTabWrites = (key: string, ids: string[]) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, ids, usedAt: 1 }))
    window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }))
  }

  it('follows a change that another tab makes to the list that is shown', () => {
    state().toggle('A')

    otherTabWrites(GUEST_KEY, ['A', 'B'])

    expect(state().ids).toEqual(['A', 'B'])
  })

  it('follows the same for an account', () => {
    signIn('user-a')

    otherTabWrites(accountKey('user-a'), ['FROM-OTHER-TAB'])

    expect(state().ids).toEqual(['FROM-OTHER-TAB'])
  })

  it('does not show a change to the list of somebody else: a tab left open on another account cannot put its favorites in', () => {
    signIn('user-b')
    state().toggle('B-1')

    // A tab that is still signed in as A (or a guest tab) writes to its own list.
    otherTabWrites(accountKey('user-a'), ['A-FROM-OLD-TAB'])
    otherTabWrites(GUEST_KEY, ['GUEST-FROM-OTHER-TAB'])

    expect(state().ids).toEqual(['B-1'])
    expect(idsIn(accountKey('user-b'))).toEqual(['B-1'])
    signOut()
    expect(state().ids).toEqual(['GUEST-FROM-OTHER-TAB'])
    signIn('user-a')
    expect(state().ids).toEqual(['A-FROM-OLD-TAB'])
  })

  it('shows an empty list when the whole storage is cleared', () => {
    state().toggle('A')
    localStorage.clear()

    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }))

    expect(state().ids).toEqual([])
  })

  it('ignores a change to a key that is not a list, and a change in sessionStorage', () => {
    state().toggle('A')
    localStorage.setItem(GUEST_KEY, JSON.stringify({ version: 1, ids: ['B'], usedAt: 1 }))

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'online-store:cart', storageArea: localStorage }),
    )
    window.dispatchEvent(
      new StorageEvent('storage', { key: GUEST_KEY, storageArea: sessionStorage }),
    )

    expect(state().ids).toEqual(['A'])
  })

  it('reads a spoilt list that another tab wrote as empty, without throwing', () => {
    state().toggle('A')
    localStorage.setItem(GUEST_KEY, '{not json')

    expect(() =>
      window.dispatchEvent(
        new StorageEvent('storage', { key: GUEST_KEY, storageArea: localStorage }),
      ),
    ).not.toThrow()
    expect(state().ids).toEqual([])
  })

  it('stops following other tabs when stopped', () => {
    state().toggle('A')
    stop()
    stop = () => undefined

    otherTabWrites(GUEST_KEY, ['A', 'B'])

    expect(state().ids).toEqual(['A'])
  })
})

describe('as the page opens', () => {
  /** A page load: the modules start again over what is in storage, the way a reload does. */
  async function reload() {
    vi.resetModules()
    const auth = await import('@/features/auth/authStore')
    const favorites = await import('./favoritesStore')
    return { auth: auth.useAuthStore, ...favorites }
  }
  const storeSession = () =>
    localStorage.setItem(
      'online-store:session',
      JSON.stringify({
        state: { token: TOKEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
        version: 1,
      }),
    )
  const list = (key: string, ids: string[]) =>
    localStorage.setItem(key, JSON.stringify({ version: 1, ids, usedAt: 1 }))

  it('lets go of the list that was kept before there was one for each person, and does not show it', async () => {
    localStorage.setItem(
      LEGACY_FAVORITES_KEY,
      JSON.stringify({ state: { ids: ['OLD-1'] }, version: 1 }),
    )

    const { useFavoritesStore: fresh } = await reload()

    expect(localStorage.getItem(LEGACY_FAVORITES_KEY)).toBeNull()
    expect(fresh.getState().ids).toEqual([])
  })

  it('does not let the legacy list into the list of an account that signs in afterwards', async () => {
    localStorage.setItem(
      LEGACY_FAVORITES_KEY,
      JSON.stringify({ state: { ids: ['OLD-1'] }, version: 1 }),
    )

    const { auth, useFavoritesStore: fresh, startFavoritesOwner: start } = await reload()
    const stopFresh = start()
    auth.setState({ token: TOKEN, expiresAt: null, user: user('user-a'), status: 'authenticated' })

    expect(fresh.getState().ids).toEqual([])
    stopFresh()
  })

  it('shows the guest list when nobody is signed in', async () => {
    list(GUEST_KEY, ['G-1'])
    list(accountKey('user-a'), ['A-1'])

    const { useFavoritesStore: fresh } = await reload()

    expect(fresh.getState().owner).toBe(GUEST)
    expect(fresh.getState().ids).toEqual(['G-1'])
  })

  it('shows the list of the account that was signed in, at once, while the API is still being asked', async () => {
    list(GUEST_KEY, ['G-1'])
    list(accountKey('user-a'), ['A-1'])
    localStorage.setItem(SIGNED_IN_AS_KEY, ownerOfAccount('user-a'))
    storeSession()

    const { auth, useFavoritesStore: fresh, startFavoritesOwner: start } = await reload()
    const stopFresh = start()

    expect(auth.getState().status).toBe('restoring')
    expect(fresh.getState().ids).toEqual(['A-1'])
    stopFresh()
  })

  it('goes to the guest list when the API says that the stored session is over', async () => {
    list(GUEST_KEY, ['G-1'])
    list(accountKey('user-a'), ['A-1'])
    localStorage.setItem(SIGNED_IN_AS_KEY, ownerOfAccount('user-a'))
    storeSession()
    const { auth, useFavoritesStore: fresh, startFavoritesOwner: start } = await reload()
    const stopFresh = start()

    auth.setState({ token: null, expiresAt: null, user: null, status: 'anonymous' })

    expect(fresh.getState().ids).toEqual(['G-1'])
    expect(localStorage.getItem(SIGNED_IN_AS_KEY)).toBeNull()
    stopFresh()
  })

  it('shows the guest list for a stored session whose account is not known, until the API answers', async () => {
    list(GUEST_KEY, ['G-1'])
    list(accountKey('user-a'), ['A-1'])
    storeSession()

    const { useFavoritesStore: fresh } = await reload()

    expect(fresh.getState().ids).toEqual(['G-1'])
  })

  it.each(['', 'guest', 'account:', 'account:UPPER', 'account:../x', 'x'.repeat(40), '{"a":1}'])(
    'ignores a remembered account that is not a digest (%j)',
    async (value) => {
      list(GUEST_KEY, ['G-1'])
      localStorage.setItem(SIGNED_IN_AS_KEY, value)
      storeSession()

      const { useFavoritesStore: fresh } = await reload()

      expect(fresh.getState().ids).toEqual(['G-1'])
    },
  )

  it('shows the guest list when the stored session is over', async () => {
    list(GUEST_KEY, ['G-1'])
    localStorage.setItem(SIGNED_IN_AS_KEY, ownerOfAccount('user-a'))
    localStorage.setItem(
      'online-store:session',
      JSON.stringify({
        state: { token: TOKEN, expiresAt: new Date(Date.now() - 1000).toISOString() },
        version: 1,
      }),
    )

    const { useFavoritesStore: fresh } = await reload()

    expect(fresh.getState().ids).toEqual(['G-1'])
  })
})
