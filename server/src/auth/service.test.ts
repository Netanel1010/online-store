import { describe, expect, it } from 'vitest'
import { HttpError } from '../lib/httpError.ts'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../testing/memoryAuthRepositories.ts'
import { verifyPassword } from './passwords.ts'
import { createAuthService, SESSION_TTL_MS } from './service.ts'
import { createLoginThrottle } from './throttle.ts'
import { hashToken } from './tokens.ts'

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

function setup() {
  let now = Date.parse('2026-01-01T10:00:00Z')
  const users = createMemoryUserRepository()
  const sessions = createMemorySessionRepository()
  const service = createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle({ now: () => now }),
    now: () => new Date(now),
  })
  return {
    service,
    users,
    sessions,
    advance: (ms: number) => (now += ms),
  }
}

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('it did not fail')
}

describe('register', () => {
  it('creates the account and signs it in, answering with the user, a token and the end of the session', async () => {
    const { service } = setup()

    const result = await service.register(GOOD)

    expect(result.user).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'נתנאל',
      email: 'netanel@example.com',
    })
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.expiresAt).toBe(
      new Date(Date.parse('2026-01-01T10:00:00Z') + SESSION_TTL_MS).toISOString(),
    )
  })

  it('never answers with the password or its hash', async () => {
    const { service } = setup()

    const result = await service.register(GOOD)

    expect(JSON.stringify(result)).not.toContain(GOOD.password)
    expect(JSON.stringify(result)).not.toContain('scrypt')
    expect(Object.keys(result.user).sort()).toEqual(['email', 'id', 'name'])
  })

  it('stores a hash of the password, not the password', async () => {
    const { service, users } = setup()

    await service.register(GOOD)

    const [stored] = [...users.stored.values()]
    expect(stored?.passwordHash).toMatch(/^scrypt\$/)
    expect(JSON.stringify(stored)).not.toContain(GOOD.password)
    expect(await verifyPassword(GOOD.password, stored!.passwordHash)).toBe(true)
    expect(await verifyPassword('Passw0rdOk', stored!.passwordHash)).toBe(false)
  })

  it('stores the session by the digest of the token, which is not stored', async () => {
    const { service, sessions } = setup()

    const { token } = await service.register(GOOD)

    expect([...sessions.stored.keys()]).toEqual([hashToken(token)])
    expect(JSON.stringify([...sessions.stored.values()])).not.toContain(token)
  })

  it('gives every account its own id, and every sign-in its own token', async () => {
    const { service } = setup()

    const a = await service.register(GOOD)
    const b = await service.register({ ...GOOD, email: 'other@example.com' })

    expect(a.user.id).not.toBe(b.user.id)
    expect(a.token).not.toBe(b.token)
  })

  it('refuses an email that is already registered, whatever its case, with a 409', async () => {
    const { service, users } = setup()
    await service.register(GOOD)

    const error = await failure(
      service.register({ ...GOOD, name: 'Other', email: 'netanel@example.com' }),
    )

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ status: 409, code: 'email_taken' })
    expect(users.stored.size).toBe(1)
  })

  it('does not create two accounts when the same email is registered at once', async () => {
    const { service, users } = setup()

    const results = await Promise.allSettled([service.register(GOOD), service.register(GOOD)])

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(
      (results.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason,
    ).toMatchObject({ status: 409, code: 'email_taken' })
    expect(users.stored.size).toBe(1)
  })
})

describe('login', () => {
  it('signs in with the right password and answers like a registration', async () => {
    const { service } = setup()
    const registered = await service.register(GOOD)

    const result = await service.login({ email: GOOD.email, password: GOOD.password })

    expect(result.user).toEqual(registered.user)
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.token).not.toBe(registered.token)
  })

  it('answers with a wrong password and with an unknown email in exactly the same way', async () => {
    const { service } = setup()
    await service.register(GOOD)

    const wrong = await failure(service.login({ email: GOOD.email, password: 'WrongPass1' }))
    const unknown = await failure(
      service.login({ email: 'nobody@example.com', password: 'WrongPass1' }),
    )

    for (const error of [wrong, unknown]) {
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ status: 401, code: 'invalid_credentials' })
    }
    expect((wrong as HttpError).message).toBe((unknown as HttpError).message)
    expect((wrong as HttpError).headers).toEqual((unknown as HttpError).headers)
  })

  it('creates no session for a failed sign-in', async () => {
    const { service, sessions } = setup()
    await service.register(GOOD)
    const before = sessions.stored.size

    await failure(service.login({ email: GOOD.email, password: 'WrongPass1' }))

    expect(sessions.stored.size).toBe(before)
  })

  it('blocks an email after five failures, even for the right password, with a 429 and the wait', async () => {
    const { service } = setup()
    await service.register(GOOD)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failure(service.login({ email: GOOD.email, password: 'WrongPass1' }))
    }

    const error = await failure(service.login({ email: GOOD.email, password: GOOD.password }))

    expect(error).toMatchObject({ status: 429, code: 'too_many_attempts' })
    expect((error as HttpError).headers['Retry-After']).toBe(String(15 * 60))
  })

  it('blocks an unknown email the same way, so the block does not say whether an account exists', async () => {
    const { service } = setup()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failure(service.login({ email: 'nobody@example.com', password: 'WrongPass1' }))
    }

    const error = await failure(
      service.login({ email: 'nobody@example.com', password: 'WrongPass1' }),
    )

    expect(error).toMatchObject({ status: 429, code: 'too_many_attempts' })
  })

  it('lets the email try again when the time is over', async () => {
    const { service, advance } = setup()
    await service.register(GOOD)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await failure(service.login({ email: GOOD.email, password: 'WrongPass1' }))
    }

    advance(15 * 60 * 1000)

    await expect(
      service.login({ email: GOOD.email, password: GOOD.password }),
    ).resolves.toBeDefined()
  })

  it('forgets the failures once the email signs in', async () => {
    const { service } = setup()
    await service.register(GOOD)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await failure(service.login({ email: GOOD.email, password: 'WrongPass1' }))
    }
    await service.login({ email: GOOD.email, password: GOOD.password })

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await failure(service.login({ email: GOOD.email, password: 'WrongPass1' }))
    }

    await expect(
      service.login({ email: GOOD.email, password: GOOD.password }),
    ).resolves.toBeDefined()
  })
})

describe('authenticate', () => {
  it('knows the user of a token, and the session it belongs to', async () => {
    const { service } = setup()
    const { token, user } = await service.register(GOOD)

    expect(await service.authenticate(token)).toEqual({ user, tokenHash: hashToken(token) })
  })

  it('does not know a token it never issued', async () => {
    const { service } = setup()
    await service.register(GOOD)

    expect(await service.authenticate('a'.repeat(43))).toBeNull()
  })

  it('does not know a token once its session has ended, and removes the session', async () => {
    const { service, sessions, advance } = setup()
    const { token } = await service.register(GOOD)

    advance(SESSION_TTL_MS - 1)
    expect(await service.authenticate(token)).not.toBeNull()
    advance(1)

    expect(await service.authenticate(token)).toBeNull()
    expect(sessions.stored.size).toBe(0)
  })

  it('does not know a token whose account no longer exists', async () => {
    const { service, users, sessions } = setup()
    const { token } = await service.register(GOOD)
    users.stored.clear()

    expect(await service.authenticate(token)).toBeNull()
    expect(sessions.stored.size).toBe(0)
  })

  it('keeps one session for each sign-in: two browsers are two sessions', async () => {
    const { service } = setup()
    const first = await service.register(GOOD)
    const second = await service.login({ email: GOOD.email, password: GOOD.password })

    await service.logout(first.token)

    expect(await service.authenticate(first.token)).toBeNull()
    expect(await service.authenticate(second.token)).not.toBeNull()
  })
})

describe('logout', () => {
  it('ends the session, so the token no longer works', async () => {
    const { service, sessions } = setup()
    const { token } = await service.register(GOOD)

    await service.logout(token)

    expect(await service.authenticate(token)).toBeNull()
    expect(sessions.stored.size).toBe(0)
  })

  it('does nothing for a token that is not a session, and does not fail', async () => {
    const { service } = setup()

    await expect(service.logout('a'.repeat(43))).resolves.toBeUndefined()
  })

  it('can be done twice', async () => {
    const { service } = setup()
    const { token } = await service.register(GOOD)

    await service.logout(token)
    await expect(service.logout(token)).resolves.toBeUndefined()
  })
})
