import { useAuthStore } from './authStore'

const state = () => useAuthStore.getState()
const STORAGE_KEY = 'online-store:auth'
const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')

describe('demo auth store: registration', () => {
  it('starts signed out with no accounts', () => {
    expect(state().users).toEqual([])
    expect(state().currentUserId).toBeNull()
  })

  it('registers an account and signs it in', async () => {
    const result = await state().register(GOOD)

    expect(result).toEqual({ ok: true })
    expect(state().users).toHaveLength(1)
    expect(state().currentUserId).toBe(state().users[0]?.id)
  })

  it('normalises the email and trims the name', async () => {
    await state().register({ ...GOOD, name: '  נתנאל  ', email: '  Netanel@Example.COM ' })

    expect(state().users[0]).toMatchObject({ name: 'נתנאל', email: 'netanel@example.com' })
  })

  it('never keeps the password in readable form', async () => {
    await state().register(GOOD)

    const user = state().users[0]!
    expect(user.passwordHash).toMatch(/^[0-9a-f]{64}$/)
    expect(user.salt).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(user)).not.toContain(GOOD.password)
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain(GOOD.password)
  })

  it('rejects an email that is already registered, ignoring case', async () => {
    await state().register(GOOD)
    state().logout()

    const result = await state().register({ ...GOOD, email: 'NETANEL@example.com' })

    expect(result).toEqual({ ok: false, reason: 'email-taken' })
    expect(state().users).toHaveLength(1)
    expect(state().currentUserId).toBeNull()
  })

  it('does not create two accounts when the same email is registered at once', async () => {
    const results = await Promise.all([state().register(GOOD), state().register(GOOD)])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(state().users).toHaveLength(1)
  })

  it('gives each account its own salt', async () => {
    await state().register(GOOD)
    await state().register({ ...GOOD, email: 'other@example.com' })

    const [a, b] = state().users
    expect(a?.salt).not.toBe(b?.salt)
    expect(a?.passwordHash).not.toBe(b?.passwordHash) // same password, different salt
  })
})

describe('demo auth store: login and logout', () => {
  beforeEach(async () => {
    await state().register(GOOD)
    state().logout()
  })

  it('signs in with the right credentials, whatever the email case', async () => {
    const result = await state().login({ email: 'NETANEL@example.com', password: GOOD.password })

    expect(result).toEqual({ ok: true })
    expect(state().currentUserId).toBe(state().users[0]?.id)
  })

  it('rejects a wrong password', async () => {
    const result = await state().login({ email: GOOD.email, password: 'WrongPass1' })

    expect(result).toEqual({ ok: false, reason: 'invalid-credentials' })
    expect(state().currentUserId).toBeNull()
  })

  it('gives the same answer for an unknown email as for a wrong password', async () => {
    const unknown = await state().login({ email: 'nobody@example.com', password: GOOD.password })
    const wrong = await state().login({ email: GOOD.email, password: 'WrongPass1' })

    expect(unknown).toEqual(wrong)
    expect(state().currentUserId).toBeNull()
  })

  it('logs out but keeps the accounts', async () => {
    await state().login({ email: GOOD.email, password: GOOD.password })

    state().logout()

    expect(state().currentUserId).toBeNull()
    expect(state().users).toHaveLength(1)
  })
})

describe('demo auth persistence', () => {
  const validUser = {
    id: 'u1',
    name: 'א',
    email: 'a@b.co',
    salt: 'a'.repeat(32),
    passwordHash: 'b'.repeat(64),
    createdAt: 'now',
  }

  it('persists the accounts and the session, as hashes', async () => {
    await state().register(GOOD)

    const persisted = stored()
    expect(persisted.version).toBe(1)
    expect(persisted.state.currentUserId).toBe(state().users[0]?.id)
    expect(Object.keys(persisted.state.users[0]).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'passwordHash',
      'salt',
    ])
  })

  it('restores the session after a reload', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { users: [validUser], currentUserId: 'u1' } }),
    )

    await useAuthStore.persist.rehydrate()

    expect(state().currentUserId).toBe('u1')
    expect(state().users).toEqual([validUser])
  })

  it('drops a session whose account does not exist', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: { users: [], currentUserId: 'ghost' } }),
    )

    await useAuthStore.persist.rehydrate()

    expect(state().currentUserId).toBeNull()
  })

  it('removes duplicate accounts when restoring', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: { users: [validUser, { ...validUser, id: 'u2' }], currentUserId: 'u1' },
      }),
    )

    await useAuthStore.persist.rehydrate()

    expect(state().users).toHaveLength(1)
  })

  it.each([
    [
      'a plaintext password field instead of a hash',
      { users: [{ ...validUser, passwordHash: 'Passw0rd' }], currentUserId: null },
    ],
    ['a malformed salt', { users: [{ ...validUser, salt: 'xyz' }], currentUserId: null }],
    ['users that are not an array', { users: 'oops', currentUserId: null }],
    ['a non-string session', { users: [validUser], currentUserId: 5 }],
    ['missing fields', {}],
  ])('ignores stored data with %s', async (_label, data) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: data }))

    await useAuthStore.persist.rehydrate()

    expect(state().users).toEqual([])
    expect(state().currentUserId).toBeNull()
  })

  it('survives non-JSON garbage in storage', async () => {
    localStorage.setItem(STORAGE_KEY, '{nope')

    await expect(useAuthStore.persist.rehydrate()).resolves.not.toThrow()
    expect(state().currentUserId).toBeNull()
  })
})
