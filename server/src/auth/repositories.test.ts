import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/database.ts'
import { createSessionRepository } from './sessionRepository.ts'
import type { Session, User } from './types.ts'
import { createUserRepository, EmailTakenError } from './userRepository.ts'

// The driver's collection is replaced by recorded calls, so these tests check WHAT the repositories
// ask MongoDB (the queries, the projection, the indexes, the writes). What MongoDB does with them is
// checked against a real server by the optional integration test.
const fake = vi.hoisted(() => {
  const collection = {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    deleteOne: vi.fn(),
    createIndex: vi.fn(),
    find: vi.fn(),
    // Only ever called for the sessions of one account: nothing here deletes accounts in bulk or
    // drops a collection.
    deleteMany: vi.fn(),
    updateMany: vi.fn(),
    drop: vi.fn(),
  }
  return { collection, collectionOf: vi.fn<(name: string) => typeof collection>(() => collection) }
})

const database = {
  connect: vi.fn(),
  close: vi.fn(),
  ping: vi.fn(),
  db: vi.fn(() => ({ collection: fake.collectionOf })),
} as unknown as Database

const user: User = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  name: 'נתנאל',
  email: 'netanel@example.com',
  passwordHash: 'scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA$AAAA',
  createdAt: new Date('2026-01-01T10:00:00Z'),
}
const session: Session = {
  tokenHash: 'a'.repeat(64),
  userId: user.id,
  createdAt: new Date('2026-01-01T10:00:00Z'),
  expiresAt: new Date('2026-01-08T10:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.collection.findOne.mockResolvedValue(null)
  fake.collection.insertOne.mockResolvedValue({ acknowledged: true })
  fake.collection.deleteOne.mockResolvedValue({ deletedCount: 1 })
  fake.collection.createIndex.mockResolvedValue('ok')
  fake.collection.deleteMany.mockResolvedValue({ deletedCount: 0 })
})

/** The cursor of `find().sort().skip().toArray()`, which answers `documents`. */
function cursorOf(documents: unknown[]) {
  const cursor = { sort: vi.fn(), skip: vi.fn(), toArray: vi.fn().mockResolvedValue(documents) }
  cursor.sort.mockReturnValue(cursor)
  cursor.skip.mockReturnValue(cursor)
  fake.collection.find.mockReturnValue(cursor)
  return cursor
}

describe('the users collection', () => {
  it('is "users", looked up when used and not when the repository is created', async () => {
    const repository = createUserRepository(database)
    expect(database.db).not.toHaveBeenCalled()

    await repository.findById('x')

    expect(fake.collectionOf).toHaveBeenCalledWith('users')
  })

  it('has a unique index on the id and a unique index on the email, and nothing else', async () => {
    await createUserRepository(database).ensureIndexes()

    expect(fake.collection.createIndex).toHaveBeenCalledTimes(2)
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { id: 1 },
      { unique: true, name: 'id_unique' },
    )
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { email: 1 },
      { unique: true, name: 'email_unique' },
    )
  })
})

describe('creating an account', () => {
  it('inserts the account as it is, with the password hash and no plain password', async () => {
    await createUserRepository(database).create(user)

    expect(fake.collection.insertOne).toHaveBeenCalledTimes(1)
    const [inserted] = fake.collection.insertOne.mock.calls[0] as [Record<string, unknown>]
    expect(inserted).toEqual(user)
    expect(Object.keys(inserted).sort()).toEqual([
      'createdAt',
      'email',
      'id',
      'name',
      'passwordHash',
    ])
  })

  it('says the email is taken when the unique index on the email refuses it', async () => {
    fake.collection.insertOne.mockRejectedValue(
      Object.assign(new Error('E11000 duplicate key error'), {
        code: 11000,
        keyPattern: { email: 1 },
      }),
    )

    await expect(createUserRepository(database).create(user)).rejects.toBeInstanceOf(
      EmailTakenError,
    )
  })

  it('does not take a duplicate id for a taken email, and passes on any other failure', async () => {
    fake.collection.insertOne.mockRejectedValueOnce(
      Object.assign(new Error('E11000'), { code: 11000, keyPattern: { id: 1 } }),
    )
    const repository = createUserRepository(database)

    const duplicateId = await repository.create(user).catch((error: unknown) => error)
    expect(duplicateId).not.toBeInstanceOf(EmailTakenError)
    expect(duplicateId).toBeInstanceOf(Error)

    fake.collection.insertOne.mockRejectedValueOnce(new Error('not primary'))
    await expect(repository.create(user)).rejects.toThrow('not primary')
  })
})

describe('finding an account', () => {
  it('looks up by email without the internal _id', async () => {
    fake.collection.findOne.mockResolvedValue(user)

    const found = await createUserRepository(database).findByEmail('netanel@example.com')

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { email: 'netanel@example.com' },
      { projection: { _id: 0 } },
    )
    expect(found).toEqual(user)
  })

  it('looks up by id', async () => {
    fake.collection.findOne.mockResolvedValue(user)

    await createUserRepository(database).findById(user.id)

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { id: user.id },
      { projection: { _id: 0 } },
    )
  })

  it('is null for an account that does not exist', async () => {
    expect(await createUserRepository(database).findByEmail('nobody@example.com')).toBeNull()
    expect(await createUserRepository(database).findById('nobody')).toBeNull()
  })

  it('never returns the MongoDB _id, even if a document has one', async () => {
    fake.collection.findOne.mockResolvedValue({ _id: 'internal', ...user })

    const found = await createUserRepository(database).findById(user.id)

    expect(found).toEqual(user)
    expect(found).not.toHaveProperty('_id')
  })

  it('refuses a stored document that is not a valid account, without quoting it', async () => {
    fake.collection.findOne.mockResolvedValue({ ...user, createdAt: 'yesterday' })

    const failure = await createUserRepository(database)
      .findById(user.id)
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('A stored account does not match the account schema')
    expect((failure as Error).message).not.toContain(user.passwordHash)
  })

  it('passes on a database failure as it is', async () => {
    fake.collection.findOne.mockRejectedValue(new Error('connection timed out'))

    await expect(createUserRepository(database).findByEmail('a@b.co')).rejects.toThrow('timed out')
  })

  it('uses the email and the id as values, never as part of the query', async () => {
    const hostile = '{"$ne":""}'
    const repository = createUserRepository(database)

    await repository.findByEmail(hostile)
    await repository.findById(hostile)

    expect(fake.collection.findOne).toHaveBeenNthCalledWith(
      1,
      { email: hostile },
      { projection: { _id: 0 } },
    )
    expect(fake.collection.findOne).toHaveBeenNthCalledWith(
      2,
      { id: hostile },
      { projection: { _id: 0 } },
    )
  })
})

describe('the sessions collection', () => {
  it('is "sessions"', async () => {
    await createSessionRepository(database).findByTokenHash('x')

    expect(fake.collectionOf).toHaveBeenCalledWith('sessions')
  })

  it('has a unique index on the token digest, one that removes a session when it expires, and one on the account', async () => {
    await createSessionRepository(database).ensureIndexes()

    expect(fake.collection.createIndex).toHaveBeenCalledTimes(3)
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { userId: 1, createdAt: -1 },
      { name: 'userId_createdAt' },
    )
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { tokenHash: 1 },
      { unique: true, name: 'tokenHash_unique' },
    )
    expect(fake.collection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'expiresAt_ttl' },
    )
  })

  it('stores the session with the digest of the token and nothing that could be the token', async () => {
    await createSessionRepository(database).create(session)

    const [inserted] = fake.collection.insertOne.mock.calls[0] as [Record<string, unknown>]
    expect(inserted).toEqual(session)
    expect(Object.keys(inserted).sort()).toEqual(['createdAt', 'expiresAt', 'tokenHash', 'userId'])
  })

  it('finds a session by the digest of its token, without _id', async () => {
    fake.collection.findOne.mockResolvedValue({ _id: 'internal', ...session })

    const found = await createSessionRepository(database).findByTokenHash(session.tokenHash)

    expect(fake.collection.findOne).toHaveBeenCalledWith(
      { tokenHash: session.tokenHash },
      { projection: { _id: 0 } },
    )
    expect(found).toEqual(session)
  })

  it('is null for a session that does not exist', async () => {
    expect(await createSessionRepository(database).findByTokenHash('nope')).toBeNull()
  })

  it('refuses a stored document that is not a valid session', async () => {
    fake.collection.findOne.mockResolvedValue({ tokenHash: 'x' })

    await expect(createSessionRepository(database).findByTokenHash('x')).rejects.toThrow(
      'does not match the session schema',
    )
  })

  it('ends one session by the digest of its token, and nothing else', async () => {
    await createSessionRepository(database).deleteByTokenHash(session.tokenHash)

    expect(fake.collection.deleteOne).toHaveBeenCalledWith({ tokenHash: session.tokenHash })
    expect(fake.collection.deleteMany).not.toHaveBeenCalled()
    expect(fake.collection.drop).not.toHaveBeenCalled()
  })
})

describe('ending every session of an account', () => {
  it('deletes the sessions of that account only, and says how many there were', async () => {
    fake.collection.deleteMany.mockResolvedValue({ deletedCount: 3 })

    const ended = await createSessionRepository(database).deleteAllForUser(user.id)

    expect(ended).toBe(3)
    expect(fake.collection.deleteMany).toHaveBeenCalledTimes(1)
    expect(fake.collection.deleteMany).toHaveBeenCalledWith({ userId: user.id })
  })

  it('uses the account id as a value, never as part of the query', async () => {
    await createSessionRepository(database).deleteAllForUser('{"$ne":""}')

    expect(fake.collection.deleteMany).toHaveBeenCalledWith({ userId: '{"$ne":""}' })
  })
})

describe('keeping the newest sessions of an account', () => {
  it('asks for the sessions after the newest ones, newest first, and ends exactly those', async () => {
    const cursor = cursorOf([{ tokenHash: 'old-1' }, { tokenHash: 'old-2' }])
    fake.collection.deleteMany.mockResolvedValue({ deletedCount: 2 })

    const ended = await createSessionRepository(database).trimToNewest(user.id, 10)

    expect(ended).toBe(2)
    expect(fake.collection.find).toHaveBeenCalledWith(
      { userId: user.id },
      { projection: { _id: 0, tokenHash: 1 } },
    )
    expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 })
    expect(cursor.skip).toHaveBeenCalledWith(10)
    expect(fake.collection.deleteMany).toHaveBeenCalledWith({
      userId: user.id,
      tokenHash: { $in: ['old-1', 'old-2'] },
    })
  })

  it('ends nothing, and does not ask to, when the account has no more than it may keep', async () => {
    cursorOf([])

    expect(await createSessionRepository(database).trimToNewest(user.id, 10)).toBe(0)
    expect(fake.collection.deleteMany).not.toHaveBeenCalled()
  })

  it('can only end sessions of the account it was asked about', async () => {
    cursorOf([{ tokenHash: 'x' }])

    await createSessionRepository(database).trimToNewest(user.id, 1)

    const [filter] = fake.collection.deleteMany.mock.calls[0] as [Record<string, unknown>]
    expect(filter).toHaveProperty('userId', user.id)
  })
})

describe('what the repositories never do', () => {
  it('delete accounts or touch the products collection', async () => {
    const users = createUserRepository(database)
    const sessions = createSessionRepository(database)

    await users.ensureIndexes()
    await users.create(user)
    await users.findByEmail(user.email)
    await sessions.ensureIndexes()
    await sessions.create(session)
    await sessions.deleteByTokenHash(session.tokenHash)

    expect(fake.collection.deleteMany).not.toHaveBeenCalled()
    expect(fake.collection.updateMany).not.toHaveBeenCalled()
    expect(fake.collection.drop).not.toHaveBeenCalled()
    expect(new Set(fake.collectionOf.mock.calls.map(([name]) => name))).toEqual(
      new Set(['users', 'sessions']),
    )
  })
})
