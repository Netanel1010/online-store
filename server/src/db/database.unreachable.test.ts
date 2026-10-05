import { describe, expect, it } from 'vitest'
import { createDatabase } from './database.ts'
import { DatabaseConnectionError } from './errors.ts'

// The real driver against an address nothing listens on (port 1): the failure is real, and no
// MongoDB is needed. It is what a developer sees with a wrong host or a database that is not running.
const unreachable = () =>
  createDatabase({
    uri: 'mongodb://shop:s3cret@127.0.0.1:1/',
    dbName: 'shop',
    connectTimeoutMs: 300,
  })

describe('an unreachable MongoDB', () => {
  it('fails to connect with a clear error, within the timeout, and without the password', async () => {
    const database = unreachable()
    const started = Date.now()

    const failure = await database.connect().then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(DatabaseConnectionError)
    expect((failure as Error).message).toMatch(/^Could not connect to MongoDB\./)
    expect((failure as Error).message).not.toContain('s3cret')
    expect(Date.now() - started).toBeLessThan(5000)
  })

  it('is reported as not answering, and can be closed', async () => {
    const database = unreachable()
    await database.connect().catch(() => undefined)

    expect(await database.ping()).toBe(false)
    await expect(database.close()).resolves.toBeUndefined()
  })
})
