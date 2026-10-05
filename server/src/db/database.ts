import { MongoClient, type Db } from 'mongodb'
import type { MongoConfig } from '../config.ts'
import { DatabaseConnectionError } from './errors.ts'

/** A health check must answer quickly even when the database is down. */
const PING_TIMEOUT_MS = 2_000

/** The MongoDB connection of the API, with an explicit life cycle. */
export interface Database {
  /** Connects, or fails with a `DatabaseConnectionError`. Safe to call more than once. */
  connect(): Promise<void>
  /** The database to read and write. Only after `connect()`. */
  db(): Db
  /** Is the database answering right now? Never throws, and never takes longer than a few seconds. */
  ping(): Promise<boolean>
  /** Closes the connections. Safe to call more than once. */
  close(): Promise<void>
}

/**
 * Creates the database object. Nothing connects until `connect()` is called, so the start of the
 * server decides when the database is needed. Create it once for the whole process: the client
 * keeps a pool of connections and watches the servers, and a client per request would open new
 * connections every time.
 */
export function createDatabase(config: MongoConfig): Database {
  const client = new MongoClient(config.uri, {
    appName: 'online-store-api',
    // Without these the driver keeps looking for a server for 30 seconds.
    serverSelectionTimeoutMS: config.connectTimeoutMs,
    connectTimeoutMS: config.connectTimeoutMs,
  })
  const database = client.db(config.dbName)

  let connected = false
  let connecting: Promise<void> | null = null

  const connect = async () => {
    try {
      await client.connect()
      connected = true
    } catch (error) {
      // Release what the failed attempt opened, so a process that gives up can exit.
      await client.close().catch(() => undefined)
      throw new DatabaseConnectionError(error)
    } finally {
      connecting = null
    }
  }

  return {
    connect: () => {
      if (connected) return Promise.resolve()
      // Callers that arrive while a connection is being made wait for the same attempt.
      connecting ??= connect()
      return connecting
    },

    db() {
      if (!connected) throw new Error('The database is not connected: call connect() first')
      return database
    },

    async ping() {
      if (!connected) return false
      try {
        await database.command({ ping: 1 }, { timeoutMS: PING_TIMEOUT_MS })
        return true
      } catch {
        return false
      }
    },

    async close() {
      connected = false
      await client.close()
    },
  }
}
