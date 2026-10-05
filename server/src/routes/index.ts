import { Router } from 'express'
import type { Database } from '../db/database.ts'
import { HttpError } from '../lib/httpError.ts'
import { createProductRepository } from '../products/repository.ts'
import { createProductsRouter } from '../products/routes.ts'
import { createProductService } from '../products/service.ts'
import { createHealthRouter } from './health.ts'

/** Everything under /api. New feature routers (products, auth, orders) are mounted here. */
export function createApiRouter(database: Database | null) {
  const router = Router()

  router.use(createHealthRouter(database))

  // Without a database (development) the products exist but cannot be read: say that, instead of
  // pretending the route is unknown.
  router.use(
    '/products',
    database
      ? createProductsRouter(createProductService(createProductRepository(database)))
      : () => {
          throw new HttpError(
            503,
            'database_not_configured',
            'This endpoint needs a database, and none is configured',
          )
        },
  )

  return router
}
