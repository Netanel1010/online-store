import cors from 'cors'
import express from 'express'
import type { Config } from './config.ts'
import type { Database } from './db/database.ts'
import { errorHandler, type Logger } from './middleware/errorHandler.ts'
import { notFound } from './middleware/notFound.ts'
import { createApiRouter } from './routes/index.ts'

/**
 * Builds the Express app without starting it, so tests can run it on any port and `server.ts`
 * stays the only place that listens. The database, when there is one, is created and connected by
 * `server.ts` and handed in: the app never opens a connection of its own.
 */
export function createApp(
  config: Pick<Config, 'corsOrigins'>,
  logger: Logger = console,
  database: Database | null = null,
) {
  const app = express()

  app.disable('x-powered-by')

  app.use(
    cors({
      // A browser may remember a preflight answer, so the requests that need one (the ones that
      // carry an Authorization header) are not each preceded by a second round trip to a host that
      // may be slow to answer.
      maxAge: 600,
      // A request without an Origin (curl, server to server) is not a browser cross-origin call
      // and is let through. A browser origin that is not listed gets no CORS headers, so the
      // browser blocks the response.
      origin: (origin, callback) =>
        callback(null, origin === undefined || config.corsOrigins.includes(origin)),
    }),
  )
  app.use(express.json({ limit: '100kb' }))

  app.use('/api', createApiRouter(database))

  app.use(notFound)
  app.use(errorHandler(logger))

  return app
}
