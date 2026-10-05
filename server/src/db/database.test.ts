import { MongoClient } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDatabase } from './database.ts'
import { DatabaseConnectionError } from './errors.ts'

// The driver is replaced by a stand-in, so these tests need no MongoDB. What a real server does is
// covered by the optional integration test and by the unreachable-server test.
const fake = vi.hoisted(() => {
  const command = vi.fn()
  const handle = { command }
  return {
    command,
    handle,
    client: { connect: vi.fn(), close: vi.fn(), db: vi.fn(() => handle) },
  }
})
vi.mock('mongodb', () => ({
  MongoClient: vi.fn(function () {
    return fake.client
  }),
}))

const CONFIG = {
  uri: 'mongodb://shop:s3cret@db.example.com:27017',
  dbName: 'shop',
  connectTimeoutMs: 1234,
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.client.connect.mockResolvedValue(undefined)
  fake.client.close.mockResolvedValue(undefined)
  fake.command.mockResolvedValue({ ok: 1 })
})

describe('createDatabase', () => {
  it('creates one client with the connection and the timeouts, and does not connect yet', () => {
    createDatabase(CONFIG)

    expect(MongoClient).toHaveBeenCalledTimes(1)
    expect(MongoClient).toHaveBeenCalledWith(
      CONFIG.uri,
      expect.objectContaining({ serverSelectionTimeoutMS: 1234, connectTimeoutMS: 1234 }),
    )
    expect(fake.client.connect).not.toHaveBeenCalled()
  })

  it('uses the configured database', () => {
    createDatabase(CONFIG)

    expect(fake.client.db).toHaveBeenCalledWith('shop')
  })
})

describe('connect', () => {
  it('connects, and a second call does not connect again', async () => {
    const database = createDatabase(CONFIG)

    await database.connect()
    await database.connect()

    expect(fake.client.connect).toHaveBeenCalledTimes(1)
  })

  it('lets callers that arrive during the attempt share it', async () => {
    const database = createDatabase(CONFIG)

    await Promise.all([database.connect(), database.connect(), database.connect()])

    expect(fake.client.connect).toHaveBeenCalledTimes(1)
  })

  it('fails with a DatabaseConnectionError that does not contain the password', async () => {
    fake.client.connect.mockRejectedValue(new Error(`bad auth for ${CONFIG.uri}`))
    const database = createDatabase(CONFIG)

    const failure = await database.connect().then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(DatabaseConnectionError)
    expect((failure as Error).message).toMatch(/^Could not connect to MongoDB\./)
    expect((failure as Error).message).not.toContain('s3cret')
  })

  it('releases the client after a failed attempt, and can try again', async () => {
    fake.client.connect.mockRejectedValueOnce(new Error('unreachable'))
    const database = createDatabase(CONFIG)

    await expect(database.connect()).rejects.toThrow(DatabaseConnectionError)
    expect(fake.client.close).toHaveBeenCalledTimes(1)

    await expect(database.connect()).resolves.toBeUndefined()
    expect(fake.client.connect).toHaveBeenCalledTimes(2)
  })
})

describe('db', () => {
  it('refuses to give the database before it is connected', () => {
    expect(() => createDatabase(CONFIG).db()).toThrow(/not connected/)
  })

  it('gives the database after it is connected', async () => {
    const database = createDatabase(CONFIG)
    await database.connect()

    expect(database.db()).toBe(fake.handle)
  })
})

describe('ping', () => {
  it('is false before the connection exists, without asking the server', async () => {
    expect(await createDatabase(CONFIG).ping()).toBe(false)
    expect(fake.command).not.toHaveBeenCalled()
  })

  it('is true when the server answers, with a short timeout', async () => {
    const database = createDatabase(CONFIG)
    await database.connect()

    expect(await database.ping()).toBe(true)
    expect(fake.command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: 2000 })
  })

  it('is false, and does not throw, when the server does not answer', async () => {
    const database = createDatabase(CONFIG)
    await database.connect()
    fake.command.mockRejectedValue(new Error('connection to db.example.com:27017 timed out'))

    expect(await database.ping()).toBe(false)
  })
})

describe('close', () => {
  it('closes the client, and the database is no longer usable', async () => {
    const database = createDatabase(CONFIG)
    await database.connect()

    await database.close()

    expect(fake.client.close).toHaveBeenCalledTimes(1)
    expect(await database.ping()).toBe(false)
    expect(() => database.db()).toThrow(/not connected/)
  })

  it('passes on a failure to close', async () => {
    const database = createDatabase(CONFIG)
    fake.client.close.mockRejectedValue(new Error('close failed'))

    await expect(database.close()).rejects.toThrow('close failed')
  })
})
