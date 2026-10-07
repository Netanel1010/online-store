import { createApp } from './app.ts'
import { createSessionRepository } from './auth/sessionRepository.ts'
import { createUserRepository } from './auth/userRepository.ts'
import { loadConfig } from './config.ts'
import { createDatabase, type Database } from './db/database.ts'
import { createJsonLogger } from './lib/logger.ts'
import { configureServerTimeouts } from './lib/serverTimeouts.ts'
import { createOrderRepository } from './orders/repository.ts'
import { createProductRepository } from './products/repository.ts'

const logger = createJsonLogger()

async function start() {
  const config = loadConfig()

  // The database is connected before the server listens, so the API never accepts requests it
  // cannot answer. If a database is configured but cannot be reached, startup stops here with the
  // reason. Without `MONGODB_URI` (development and test only) the API runs without a database.
  let database: Database | null = null
  if (config.mongodb) {
    database = createDatabase(config.mongodb)
    await database.connect()
    logger.info('MongoDB connected', { database: config.mongodb.dbName })
    // Once at startup, never per request. Each does nothing when there is nothing to do: the index
    // exists, and every product already has its current search text. A database filled before the
    // search existed becomes searchable here, without a new seed.
    const products = createProductRepository(database)
    await products.ensureIndexes()
    const prepared = await products.ensureSearchFields()
    if (prepared > 0) logger.info('Search text stored', { products: prepared })
    // The unique indexes of the accounts and the sessions (and the one that expires sessions).
    await createUserRepository(database).ensureIndexes()
    await createSessionRepository(database).ensureIndexes()
    // The unique order number, the unique idempotency key of an account, and the list of its orders.
    await createOrderRepository(database).ensureIndexes()
  } else {
    logger.warn?.('MONGODB_URI is not set: running without a database')
  }

  const server = createApp(config, logger, database).listen(config.port, () => {
    logger.info('API listening', {
      port: config.port,
      environment: config.nodeEnv,
      trustProxyHops: config.trustProxyHops,
    })
  })

  configureServerTimeouts(server)

  // Hosts stop a container with SIGTERM: finish the requests in progress, then close the database
  // and exit. The timer makes sure a stuck connection cannot keep the process alive for ever.
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('shutting down', { signal })
    setTimeout(() => process.exit(1), 10_000).unref()
    server.close(async () => {
      try {
        await database?.close()
        process.exit(0)
      } catch (error) {
        logger.error(error, { during: 'shutdown' })
        process.exit(1)
      }
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error) => {
  // A failure to start: the message says what is wrong (an invalid setting, a database that cannot
  // be reached) and, like every log line, never holds a connection string's password.
  logger.error(error, { during: 'startup' })
  process.exit(1)
})
