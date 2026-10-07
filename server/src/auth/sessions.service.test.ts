import { describe, expect, it } from 'vitest'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../testing/memoryAuthRepositories.ts'
import { createAuthService, MAX_SESSIONS_PER_USER, SESSION_TTL_MS } from './service.ts'
import { createLoginThrottle } from './throttle.ts'

const GOOD = { name: 'נתנאל', email: 'netanel@example.com', password: 'Passw0rdOK' }

/** The service over in-memory repositories, with a clock the test moves and a cap it chooses. */
function setup(cap?: number) {
  let now = Date.parse('2026-01-01T10:00:00Z')
  const users = createMemoryUserRepository()
  const sessions = createMemorySessionRepository()
  const service = createAuthService({
    users: users.repository,
    sessions: sessions.repository,
    throttle: createLoginThrottle({ now: () => now }),
    now: () => new Date(now),
    ...(cap !== undefined && { maxSessionsPerUser: cap }),
  })
  const advance = (ms: number) => (now += ms)
  const signIn = (email = GOOD.email) => {
    advance(1000)
    return service.login({ email, password: GOOD.password })
  }
  const alive = async (token: string) => (await service.authenticate(token)) !== null
  return { service, users, sessions, advance, signIn, alive }
}

describe('the sessions of an account', () => {
  it('keeps no more than the cap: signing in once more ends the oldest, never the new one', async () => {
    const { service, sessions, signIn, alive } = setup(3)
    const first = await service.register(GOOD)
    const second = await signIn()
    const third = await signIn()
    expect(sessions.stored.size).toBe(3)

    const fourth = await signIn()

    expect(sessions.stored.size).toBe(3)
    expect(await alive(first.token)).toBe(false)
    for (const kept of [second, third, fourth]) expect(await alive(kept.token)).toBe(true)
  })

  it('goes on ending the oldest as more sign-ins come', async () => {
    const { service, signIn, alive } = setup(2)
    const signedIn = [await service.register(GOOD)]
    for (let i = 0; i < 4; i += 1) signedIn.push(await signIn())

    const live = await Promise.all(signedIn.map((session) => alive(session.token)))

    expect(live).toEqual([false, false, false, true, true])
  })

  it('counts a registration as the first session', async () => {
    const { service, sessions } = setup(1)

    await service.register(GOOD)

    expect(sessions.stored.size).toBe(1)
  })

  it('does not end the sessions of another account when one signs in again', async () => {
    const { service, signIn, alive } = setup(2)
    const other = await service.register({ ...GOOD, email: 'other@example.com' })
    await service.register(GOOD)
    await signIn()

    await signIn()

    expect(await alive(other.token)).toBe(true)
  })

  it('treats two sign-ins at the same moment as the order they happened in', async () => {
    const { service, sessions } = setup(1)
    // The clock does not move between these two.
    const first = await service.register(GOOD)
    const second = await service.login({ email: GOOD.email, password: GOOD.password })

    expect(sessions.stored.size).toBe(1)
    expect(await service.authenticate(first.token)).toBeNull()
    expect(await service.authenticate(second.token)).not.toBeNull()
  })

  it('still signs in when ending the oldest sessions fails: it is housekeeping, not part of the sign-in', async () => {
    const users = createMemoryUserRepository()
    const sessions = createMemorySessionRepository()
    sessions.repository.trimToNewest = () => Promise.reject(new Error('database hiccup'))
    const service = createAuthService({
      users: users.repository,
      sessions: sessions.repository,
      throttle: createLoginThrottle(),
    })

    const signedIn = await service.register(GOOD)

    expect(await service.authenticate(signedIn.token)).not.toBeNull()
  })

  it('has a default cap that is generous for a person and finite', () => {
    expect(MAX_SESSIONS_PER_USER).toBeGreaterThanOrEqual(5)
    expect(MAX_SESSIONS_PER_USER).toBeLessThanOrEqual(25)
  })
})

describe('signing out everywhere', () => {
  it('ends every session of the account, on every device, the asking one included', async () => {
    const { service, signIn } = setup()
    const phone = await service.register(GOOD)
    const laptop = await signIn()
    const tablet = await signIn()

    await service.logoutAll(phone.user.id)

    for (const { token } of [phone, laptop, tablet]) {
      expect(await service.authenticate(token)).toBeNull()
    }
  })

  it('leaves the sessions of other accounts alone', async () => {
    const { service } = setup()
    const mine = await service.register(GOOD)
    const theirs = await service.register({ ...GOOD, email: 'other@example.com' })

    await service.logoutAll(mine.user.id)

    expect(await service.authenticate(mine.token)).toBeNull()
    expect(await service.authenticate(theirs.token)).not.toBeNull()
  })

  it('does nothing, and does not fail, for an account with no session', async () => {
    const { service } = setup()

    await expect(service.logoutAll('nobody')).resolves.toBeUndefined()
  })

  it('does not stop the account from signing in again, with a new token', async () => {
    const { service, signIn } = setup()
    const before = await service.register(GOOD)
    await service.logoutAll(before.user.id)

    const after = await signIn()

    expect(after.token).not.toBe(before.token)
    expect(await service.authenticate(after.token)).not.toBeNull()
    expect(await service.authenticate(before.token)).toBeNull()
  })
})

describe('a session that has been ended, or has run out', () => {
  it('can never be used again, however many times it is tried', async () => {
    const { service } = setup()
    const { token } = await service.register(GOOD)
    await service.logout(token)

    for (let i = 0; i < 3; i += 1) expect(await service.authenticate(token)).toBeNull()
  })

  it('is refused once it has expired, and is removed on the spot, without waiting for the database', async () => {
    const { service, sessions, advance } = setup()
    const { token } = await service.register(GOOD)
    advance(SESSION_TTL_MS)

    expect(await service.authenticate(token)).toBeNull()
    expect(sessions.stored.size).toBe(0)
  })

  it('is still good one moment before it expires', async () => {
    const { service, advance } = setup()
    const { token } = await service.register(GOOD)
    advance(SESSION_TTL_MS - 1)

    expect(await service.authenticate(token)).not.toBeNull()
  })

  it('is refused, and removed, when its account no longer exists', async () => {
    const { service, users, sessions } = setup()
    const { token } = await service.register(GOOD)
    users.stored.clear()

    expect(await service.authenticate(token)).toBeNull()
    expect(sessions.stored.size).toBe(0)
  })

  it('does not let a token that was never issued in', async () => {
    const { service } = setup()
    await service.register(GOOD)

    expect(await service.authenticate('A'.repeat(43))).toBeNull()
  })
})
