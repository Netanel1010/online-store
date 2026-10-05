import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.ts'
import { listen } from '../testing/listen.ts'
import { createDatabase, type Database } from './database.ts'

// Optional: runs only when MONGODB_TEST_URI points at a real MongoDB (local or Atlas), for example
//   MONGODB_TEST_URI=mongodb://localhost:27017 npm run test:server
// Without it the tests are skipped, so ordinary runs and CI need no database. The tests work in a
// database of their own with a random name and drop it at the end; they never use MONGODB_URI.
const uri = process.env.MONGODB_TEST_URI

describe.skipIf(!uri)('MongoDB (integration, needs MONGODB_TEST_URI)', () => {
  const dbName = `online_store_test_${randomUUID().slice(0, 8)}`
  // Created in beforeAll: the body of a skipped describe still runs, and there is no URI then.
  let database: Database
  let api: Awaited<ReturnType<typeof listen>>

  beforeAll(async () => {
    database = createDatabase({ uri: uri!, dbName, connectTimeoutMs: 10_000 })
    await database.connect()
    api = await listen(createApp({ corsOrigins: [] }, undefined, database))
  })

  afterAll(async () => {
    await api.close()
    await database.db().dropDatabase()
    await database.close()
  })

  it('answers a ping', async () => {
    expect(await database.ping()).toBe(true)
  })

  it('writes and reads a document in its own database', async () => {
    const products = database.db().collection<{ _id: string; name: string }>('products')

    await products.insertOne({ _id: 'GV-4070', name: 'Gigabyte RTX 4070 Gaming' })

    expect(await products.findOne({ _id: 'GV-4070' })).toEqual({
      _id: 'GV-4070',
      name: 'Gigabyte RTX 4070 Gaming',
    })
    expect(database.db().databaseName).toBe(dbName)
  })

  it('is reported as up by /api/health/ready', async () => {
    const response = await fetch(`${api.url}/api/health/ready`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'up' })
  })
})
