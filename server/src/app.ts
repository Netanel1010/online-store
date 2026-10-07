import cors from 'cors'
import express from 'express'
import type { Config } from './config.ts'
import type { Database } from './db/database.ts'
import { silentLogger, type Logger } from './lib/logger.ts'
import { errorHandler } from './middleware/errorHandler.ts'
import { notFound } from './middleware/notFound.ts'
import { requestLogging } from './middleware/requestLogging.ts'
import { requestTimeout } from './middleware/requestTimeout.ts'
import { securityHeaders } from './middleware/securityHeaders.ts'
import { createApiRouter } from './routes/index.ts'

/**
 * Builds the Express app without starting it, so tests can run it on any port and `server.ts`
 * stays the only place that listens. The database, when there is one, is created and connected by
 * `server.ts` and handed in: the app never opens a connection of its own.
 */
export function createApp(
  config: Pick<Config, 'corsOrigins'> & Partial<Pick<Config, 'trustProxyHops'>>,
  // server.ts passes the JSON logger; an app built without one (most tests) logs nothing.
  logger: Logger = silentLogger,
  database: Database | null = null,
) {
  const app = express()

  app.disable('x-powered-by')
  // Behind the host's proxies the visitor's address is in X-Forwarded-For: read it from the right,
  // past exactly as many proxies as there are, so a header the visitor sends cannot choose it.
  if (config.trustProxyHops) app.set('trust proxy', config.trustProxyHops)

  // First, so that every answer, even the one for a request that is refused later, has an id and a log line.
  app.use(requestLogging(logger))
  app.use(securityHeaders)
  app.use(requestTimeout())

  app.use(
    cors({
      // The storefront reads (GET) and signs in, signs out or places an order (POST). Nothing else
      // is offered, so nothing else is allowed from a browser. `Idempotency-Key` is what makes a
      // retry of an order safe (see orders/service.ts).
      methods: ['GET', 'HEAD', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
      // A page's script can read only the headers a server lists: the one that says how long to wait.
      exposedHeaders: ['Retry-After', 'X-Request-Id'],
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
