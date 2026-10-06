import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { createDatabase, type Database } from '../db/database.ts'
import { listen } from '../testing/listen.ts'
import { createSessionRepository } from './sessionRepository.ts'
import { generateToken, hashToken } from './tokens.ts'
import type { Session, SignedIn, User } from './types.ts'
import { createUserRepository, EmailTakenError } from './userRepository.ts'

// Optional: runs only when MONGODB_TEST_URI points at a real MongoDB (local or Atlas), for example
//   MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:server
// Without it the tests are skipped, so ordinary runs and CI need no database. They work in a
// database of their own with a random name and drop it at the end; they never use MONGODB_URI and
// never touch the `products` collection. The tests build on each other, in the order written.
const uri = process.env.MONGODB_TEST_URI

describe.skipIf(!uri)(
  'accounts and sessions on a real MongoDB (integration, needs MONGODB_TEST_URI)',
  () => {
    let database: Database
    let users: ReturnType<typeof createUserRepository>
    let sessions: ReturnType<typeof createSessionRepository>
    let api: Awaited<ReturnType<typeof listen>>
    const rawUsers = () => database.db().collection('users')
    const rawSessions = () => database.db().collection('sessions')

    const account = (overrides: Partial<User> = {}): User => ({
      id: randomUUID(),
      name: 'נתנאל',
      email: `user-${randomUUID().slice(0, 8)}@example.com`,
      passwordHash: 'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
      createdAt: new Date(),
      ...overrides,
    })

    beforeAll(async () => {
      const dbName = `online_store_test_${randomUUID().slice(0, 8)}`
      database = createDatabase({ uri: uri!, dbName, connectTimeoutMs: 10_000 })
      await database.connect()
      users = createUserRepository(database)
      sessions = createSessionRepository(database)
      api = await listen(createApp({ corsOrigins: [] }, undefined, database))
    })

    afterAll(async () => {
      await api.close()
      await database.db().dropDatabase()
      await database.close()
    })

    it('creates the unique indexes, and creating them again changes nothing', async () => {
      await users.ensureIndexes()
      await users.ensureIndexes()
      await sessions.ensureIndexes()
      await sessions.ensureIndexes()

      const userIndexes = await rawUsers().listIndexes().toArray()
      const sessionIndexes = await rawSessions().listIndexes().toArray()
      expect(userIndexes.map((index) => index.name).sort()).toEqual([
        '_id_',
        'email_unique',
        'id_unique',
      ])
      expect(userIndexes.find((index) => index.name === 'email_unique')).toMatchObject({
        key: { email: 1 },
        unique: true,
      })
      expect(sessionIndexes.map((index) => index.name).sort()).toEqual([
        '_id_',
        'expiresAt_ttl',
        'tokenHash_unique',
      ])
      expect(sessionIndexes.find((index) => index.name === 'expiresAt_ttl')).toMatchObject({
        key: { expiresAt: 1 },
        expireAfterSeconds: 0,
      })
      expect(sessionIndexes.find((index) => index.name === 'tokenHash_unique')).toMatchObject({
        unique: true,
      })
    })

    it('stores an account and finds it by email and by id, without _id', async () => {
      const user = account()

      await users.create(user)

      expect(await users.findByEmail(user.email)).toEqual(user)
      expect(await users.findById(user.id)).toEqual(user)
      expect(await users.findByEmail(user.email)).not.toHaveProperty('_id')
      expect(await users.findByEmail('nobody@example.com')).toBeNull()
      expect(await users.findById('nobody')).toBeNull()
      expect((await rawUsers().findOne({ id: user.id }))?._id).toBeDefined()
    })

    it('refuses a second account with the same email, and a second with the same id', async () => {
      const user = account()
      await users.create(user)

      await expect(users.create(account({ email: user.email }))).rejects.toBeInstanceOf(
        EmailTakenError,
      )
      const sameId = await users.create(account({ id: user.id })).catch((error: unknown) => error)

      expect(sameId).toBeInstanceOf(Error)
      expect(sameId).not.toBeInstanceOf(EmailTakenError)
      expect(await rawUsers().countDocuments({ email: user.email })).toBe(1)
    })

    it('lets exactly one of several simultaneous registrations of an email win', async () => {
      const email = `race-${randomUUID().slice(0, 8)}@example.com`

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => users.create(account({ email }))),
      )

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      for (const result of results) {
        if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(EmailTakenError)
      }
      expect(await rawUsers().countDocuments({ email })).toBe(1)
    })

    it('treats an email that looks like a query as plain text', async () => {
      expect(await users.findByEmail('{"$ne":""}')).toBeNull()
    })

    it('stores a session by the digest of its token, finds it, and ends it', async () => {
      const token = generateToken()
      const session: Session = {
        tokenHash: hashToken(token),
        userId: 'someone',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }

      await sessions.create(session)

      expect(await sessions.findByTokenHash(session.tokenHash)).toEqual(session)
      expect(
        JSON.stringify(await rawSessions().findOne({ tokenHash: session.tokenHash })),
      ).not.toContain(token)
      await expect(sessions.create(session)).rejects.toMatchObject({ code: 11000 })

      await sessions.deleteByTokenHash(session.tokenHash)
      expect(await sessions.findByTokenHash(session.tokenHash)).toBeNull()
      await sessions.deleteByTokenHash(session.tokenHash)
    })

    describe('over HTTP, against the real database', () => {
      const credentials = {
        name: 'נתנאל',
        email: `http-${randomUUID().slice(0, 8)}@example.com`,
        password: 'Passw0rdOK',
      }
      const post = (path: string, body?: unknown, token?: string) =>
        fetch(`${api.url}${path}`, {
          method: 'POST',
          headers: {
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      const me = (token?: string) =>
        fetch(`${api.url}/api/auth/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      let registered: SignedIn

      it('registers, and stores a hash of the password', async () => {
        const response = await post('/api/auth/register', credentials)

        expect(response.status).toBe(201)
        registered = (await response.json()) as SignedIn
        const stored = await rawUsers().findOne({ id: registered.user.id })
        expect(stored?.passwordHash).toMatch(/^scrypt\$/)
        expect(JSON.stringify(stored)).not.toContain(credentials.password)
        expect(stored?.email).toBe(credentials.email)
      })

      it('answers who is signed in, and nothing sensitive', async () => {
        const response = await me(registered.token)

        expect(response.status).toBe(200)
        const text = await response.text()
        expect(JSON.parse(text)).toEqual({ user: registered.user })
        expect(text).not.toMatch(/scrypt|passwordHash/)
      })

      it('refuses the same email again, in another case', async () => {
        const response = await post('/api/auth/register', {
          ...credentials,
          email: credentials.email.toUpperCase(),
        })

        expect(response.status).toBe(409)
        expect(await rawUsers().countDocuments({ email: credentials.email })).toBe(1)
      })

      it('signs in with the right password and refuses a wrong one', async () => {
        const wrong = await post('/api/auth/login', {
          email: credentials.email,
          password: 'WrongPass1',
        })
        const right = await post('/api/auth/login', {
          email: credentials.email,
          password: credentials.password,
        })

        expect(wrong.status).toBe(401)
        expect(right.status).toBe(200)
        const signedIn = (await right.json()) as SignedIn
        expect(signedIn.token).not.toBe(registered.token)
        expect((await me(signedIn.token)).status).toBe(200)
      })

      it('does not accept a session that has expired, even before the database removes it', async () => {
        const token = generateToken()
        await sessions.create({
          tokenHash: hashToken(token),
          userId: registered.user.id,
          createdAt: new Date(Date.now() - 2 * 60_000),
          expiresAt: new Date(Date.now() - 60_000),
        })

        expect((await me(token)).status).toBe(401)
      })

      it('signs out: the token stops working, and the session is gone from the database', async () => {
        expect((await post('/api/auth/logout', undefined, registered.token)).status).toBe(204)

        expect((await me(registered.token)).status).toBe(401)
        expect(await sessions.findByTokenHash(hashToken(registered.token))).toBeNull()
      })

      it('has written to the accounts and the sessions only: the temporary database has no other collection', async () => {
        const names = (await database.db().listCollections().toArray()).map(
          (collection) => collection.name,
        )

        expect(names.sort()).toEqual(['sessions', 'users'])
      })
    })
  },
)
