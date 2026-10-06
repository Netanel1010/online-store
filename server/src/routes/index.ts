import { Router } from 'express'
import { createAuthRouter } from '../auth/routes.ts'
import { createAuthService } from '../auth/service.ts'
import { createSessionRepository } from '../auth/sessionRepository.ts'
import { createLoginThrottle } from '../auth/throttle.ts'
import { createUserRepository } from '../auth/userRepository.ts'
import type { Database } from '../db/database.ts'
import { HttpError } from '../lib/httpError.ts'
import { createProductRepository } from '../products/repository.ts'
import { createProductsRouter } from '../products/routes.ts'
import { createProductService } from '../products/service.ts'
import { createHealthRouter } from './health.ts'

// Without a database (development) these features exist but cannot be used: say that, instead of
// pretending the route is unknown.
const databaseNotConfigured = () => {
  throw new HttpError(
    503,
    'database_not_configured',
    'This endpoint needs a database, and none is configured',
  )
}

/** Everything under /api. New feature routers (cart, orders) are mounted here. */
export function createApiRouter(database: Database | null) {
  const router = Router()

  router.use(createHealthRouter(database))

  router.use(
    '/products',
    database
      ? createProductsRouter(createProductService(createProductRepository(database)))
      : databaseNotConfigured,
  )

  router.use(
    '/auth',
    database
      ? createAuthRouter(
          createAuthService({
            users: createUserRepository(database),
            sessions: createSessionRepository(database),
            // One for the whole process: it is what counts the failed sign-ins.
            throttle: createLoginThrottle(),
          }),
        )
      : databaseNotConfigured,
  )

  return router
}
