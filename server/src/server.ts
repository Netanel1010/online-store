import { createApp } from './app.ts'
import { createSessionRepository } from './auth/sessionRepository.ts'
import { createUserRepository } from './auth/userRepository.ts'
import { loadConfig } from './config.ts'
import { createDatabase, type Database } from './db/database.ts'
import { createProductRepository } from './products/repository.ts'

async function start() {
  const config = loadConfig()

  // The database is connected before the server listens, so the API never accepts requests it
  // cannot answer. If a database is configured but cannot be reached, startup stops here with the
  // reason. Without `MONGODB_URI` (development and test only) the API runs without a database.
  let database: Database | null = null
  if (config.mongodb) {
    database = createDatabase(config.mongodb)
    await database.connect()
    console.log(`MongoDB connected (database "${config.mongodb.dbName}")`)
    // Once at startup, never per request. Each does nothing when there is nothing to do: the index
    // exists, and every product already has its current search text. A database filled before the
    // search existed becomes searchable here, without a new seed.
    const products = createProductRepository(database)
    await products.ensureIndexes()
    const prepared = await products.ensureSearchFields()
    if (prepared > 0) console.log(`Search text stored for ${prepared} product(s)`)
    // The unique indexes of the accounts and the sessions (and the one that expires sessions).
    await createUserRepository(database).ensureIndexes()
    await createSessionRepository(database).ensureIndexes()
  } else {
    console.log('MONGODB_URI is not set: running without a database')
  }

  const server = createApp(config, console, database).listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port} (${config.nodeEnv})`)
  })

  // Hosts stop a container with SIGTERM: finish the requests in progress, then close the database
  // and exit. The timer makes sure a stuck connection cannot keep the process alive for ever.
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`${signal} received, shutting down`)
    setTimeout(() => process.exit(1), 10_000).unref()
    server.close(async () => {
      try {
        await database?.close()
        process.exit(0)
      } catch (error) {
        console.error(
          'Closing the database failed:',
          error instanceof Error ? error.message : error,
        )
        process.exit(1)
      }
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
