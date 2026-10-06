import * as authService from './authService'
import type { SignedIn } from './authService'
import { useAuthStore } from './authStore'

const TOKEN = 'T'.repeat(43)
const FUTURE = new Date(Date.now() + 3_600_000).toISOString()
const signedIn: SignedIn = {
  user: { id: 'u1', name: 'נתנאל', email: 'netanel@example.com' },
  token: TOKEN,
  expiresAt: FUTURE,
}
const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

const store = () => useAuthStore.getState()
const stored = () => JSON.parse(localStorage.getItem('online-store:session') ?? 'null')

/** Starts as if the page had just loaded with this in storage. */
async function loadWith(value: unknown) {
  localStorage.setItem('online-store:session', JSON.stringify(value))
  await useAuthStore.persist.rehydrate()
}
const withToken = { state: { token: TOKEN, expiresAt: FUTURE }, version: 1 }

describe('registration', () => {
  it('starts signed out', () => {
    expect(store()).toMatchObject({ status: 'anonymous', token: null, user: null })
  })

  it('signs the visitor in with what the API answers, and keeps only the token', async () => {
    const register = vi
      .spyOn(authService, 'registerAccount')
      .mockResolvedValue({ ok: true, value: signedIn })

    expect(await store().register(GOOD)).toEqual({ ok: true })

    expect(register).toHaveBeenCalledWith(GOOD)
    expect(store()).toMatchObject({ status: 'authenticated', token: TOKEN, user: signedIn.user })
    expect(stored().state).toEqual({ token: TOKEN, expiresAt: FUTURE })
  })

  it('never keeps the password, or the account, in storage', async () => {
    vi.spyOn(authService, 'registerAccount').mockResolvedValue({ ok: true, value: signedIn })

    await store().register(GOOD)

    const raw = localStorage.getItem('online-store:session')!
    expect(raw).not.toContain(GOOD.password)
    expect(raw).not.toContain(GOOD.email)
    expect(raw).not.toContain('user')
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(GOOD.password)
  })

  it.each(['email-taken', 'invalid-input', 'unavailable'] as const)(
    'reports "%s" and stays signed out',
    async (reason) => {
      vi.spyOn(authService, 'registerAccount').mockResolvedValue({ ok: false, reason })

      expect(await store().register(GOOD)).toEqual({ ok: false, reason })

      expect(store()).toMatchObject({ status: 'anonymous', token: null, user: null })
      expect(localStorage.getItem('online-store:session') ?? '').not.toContain(TOKEN)
    },
  )
})

describe('login', () => {
  const credentials = { email: GOOD.email, password: GOOD.password }

  it('signs the visitor in', async () => {
    vi.spyOn(authService, 'loginAccount').mockResolvedValue({ ok: true, value: signedIn })

    expect(await store().login(credentials)).toEqual({ ok: true })

    expect(store()).toMatchObject({ status: 'authenticated', token: TOKEN, user: signedIn.user })
    expect(stored().state.token).toBe(TOKEN)
  })

  it.each(['invalid-credentials', 'too-many-attempts', 'invalid-input', 'unavailable'] as const)(
    'reports "%s" and stays signed out',
    async (reason) => {
      vi.spyOn(authService, 'loginAccount').mockResolvedValue({ ok: false, reason })

      expect(await store().login(credentials)).toEqual({ ok: false, reason })

      expect(store()).toMatchObject({ status: 'anonymous', token: null })
    },
  )

  it('keeps an earlier session when a later attempt fails', async () => {
    vi.spyOn(authService, 'loginAccount').mockResolvedValueOnce({ ok: true, value: signedIn })
    await store().login(credentials)
    vi.spyOn(authService, 'loginAccount').mockResolvedValue({
      ok: false,
      reason: 'invalid-credentials',
    })

    await store().login(credentials)

    expect(store()).toMatchObject({ status: 'authenticated', token: TOKEN })
  })
})

describe('logout', () => {
  beforeEach(async () => {
    vi.spyOn(authService, 'loginAccount').mockResolvedValue({ ok: true, value: signedIn })
    await store().login({ email: GOOD.email, password: GOOD.password })
  })

  it('signs out at once, removes the token from storage and asks the API to end the session', () => {
    const end = vi.spyOn(authService, 'endSession').mockResolvedValue()

    store().logout()

    expect(store()).toMatchObject({ status: 'anonymous', token: null, user: null, expiresAt: null })
    expect(stored().state).toEqual({ token: null, expiresAt: null })
    expect(end).toHaveBeenCalledWith(TOKEN)
  })

  it('does not wait for the API, and does not mind it failing', async () => {
    vi.spyOn(authService, 'endSession').mockRejectedValue(new Error('down'))
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    store().logout()
    await new Promise((resolve) => setTimeout(resolve, 10))
    process.off('unhandledRejection', unhandled)

    expect(store().status).toBe('anonymous')
  })

  it('does nothing when nobody is signed in', () => {
    store().logout()
    const end = vi.spyOn(authService, 'endSession').mockResolvedValue()

    store().logout()

    expect(end).not.toHaveBeenCalled()
    expect(store().status).toBe('anonymous')
  })
})

describe('restoring a session after a reload', () => {
  it('asks the API who the stored token belongs to, and then knows the visitor', async () => {
    const me = vi
      .spyOn(authService, 'fetchCurrentUser')
      .mockResolvedValue({ status: 'signed-in', user: signedIn.user })
    await loadWith(withToken)
    expect(store()).toMatchObject({ status: 'restoring', token: TOKEN, user: null })

    await store().restore()

    expect(me).toHaveBeenCalledWith(TOKEN, expect.any(AbortSignal))
    expect(store()).toMatchObject({ status: 'authenticated', user: signedIn.user, token: TOKEN })
  })

  it('does not ask when there is no token', async () => {
    const me = vi.spyOn(authService, 'fetchCurrentUser')

    await store().restore()

    expect(me).not.toHaveBeenCalled()
    expect(store().status).toBe('anonymous')
  })

  it('signs out, and forgets the token, when the API does not accept it any more', async () => {
    vi.spyOn(authService, 'fetchCurrentUser').mockResolvedValue({ status: 'signed-out' })
    await loadWith(withToken)

    await store().restore()

    expect(store()).toMatchObject({ status: 'anonymous', token: null, user: null })
    expect(stored().state).toEqual({ token: null, expiresAt: null })
  })

  it('keeps the token, and says the API is unavailable, when it cannot be asked', async () => {
    const me = vi
      .spyOn(authService, 'fetchCurrentUser')
      .mockResolvedValueOnce({ status: 'unavailable' })
      .mockResolvedValue({ status: 'signed-in', user: signedIn.user })
    await loadWith(withToken)

    await store().restore()

    expect(store()).toMatchObject({ status: 'unavailable', token: TOKEN, user: null })
    expect(stored().state.token).toBe(TOKEN)

    // Trying again once the API is back.
    await store().restore()
    expect(me).toHaveBeenCalledTimes(2)
    expect(store()).toMatchObject({ status: 'authenticated', user: signedIn.user })
  })

  it('asks only once when it is called from several places at the same time', async () => {
    let answer: (value: Awaited<ReturnType<typeof authService.fetchCurrentUser>>) => void = () => {}
    const me = vi
      .spyOn(authService, 'fetchCurrentUser')
      .mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    await loadWith(withToken)

    const calls = [store().restore(), store().restore(), store().restore()]
    answer({ status: 'signed-in', user: signedIn.user })
    await Promise.all(calls)

    expect(me).toHaveBeenCalledTimes(1)
  })

  it('does not ask again once the visitor is known', async () => {
    const me = vi
      .spyOn(authService, 'fetchCurrentUser')
      .mockResolvedValue({ status: 'signed-in', user: signedIn.user })
    await loadWith(withToken)
    await store().restore()

    await store().restore()

    expect(me).toHaveBeenCalledTimes(1)
  })

  it('does not bring the visitor back when they signed out while the API was answering', async () => {
    let answer: (value: Awaited<ReturnType<typeof authService.fetchCurrentUser>>) => void = () => {}
    vi.spyOn(authService, 'fetchCurrentUser').mockImplementation(
      () => new Promise((resolve) => (answer = resolve)),
    )
    vi.spyOn(authService, 'endSession').mockResolvedValue()
    await loadWith(withToken)

    const pending = store().restore()
    store().logout()
    answer({ status: 'signed-in', user: signedIn.user })
    await pending

    expect(store()).toMatchObject({ status: 'anonymous', token: null, user: null })
  })
})

describe('what is read back from storage', () => {
  it.each([
    ['nothing', null],
    ['text that is not JSON', 'not json at all'],
    ['an empty object', {}],
    ['a token that is not text', { state: { token: 42, expiresAt: FUTURE }, version: 1 }],
    ['a token that is far too short', { state: { token: 'x', expiresAt: FUTURE }, version: 1 }],
    ['a date that is not a date', { state: { token: TOKEN, expiresAt: 'soon' }, version: 1 }],
    ['a token without a date', { state: { token: TOKEN, expiresAt: null }, version: 1 }],
    ['the accounts of the old demo, which are not a session', { users: [], currentUserId: 'x' }],
  ])('starts signed out for %s', async (_name, value) => {
    if (typeof value === 'string') localStorage.setItem('online-store:session', value)
    else if (value !== null) localStorage.setItem('online-store:session', JSON.stringify(value))

    await useAuthStore.persist.rehydrate()

    expect(store()).toMatchObject({ status: 'anonymous', token: null, user: null })
  })

  it('drops a session whose end has already passed, without asking the API', async () => {
    const me = vi.spyOn(authService, 'fetchCurrentUser')

    await loadWith({
      state: { token: TOKEN, expiresAt: new Date(Date.now() - 1000).toISOString() },
      version: 1,
    })
    await store().restore()

    expect(store().status).toBe('anonymous')
    expect(me).not.toHaveBeenCalled()
  })

  it('does not take a user, a status or a role from storage', async () => {
    await loadWith({
      state: {
        token: TOKEN,
        expiresAt: FUTURE,
        user: { id: 'x', name: 'Admin', email: 'a@b.co' },
        status: 'authenticated',
        role: 'admin',
      },
      version: 1,
    })

    expect(store()).toMatchObject({ status: 'restoring', user: null })
    expect(store()).not.toHaveProperty('role')
  })
})

describe('the accounts of the old demo', () => {
  it('are removed from the browser when the site loads', async () => {
    localStorage.setItem(
      'online-store:auth',
      JSON.stringify({ users: [{ id: 'x', passwordHash: 'abc' }], currentUserId: 'x' }),
    )

    vi.resetModules()
    await import('./authStore')

    expect(localStorage.getItem('online-store:auth')).toBeNull()
  })
})
