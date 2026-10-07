import { Router } from 'express'
import { createRequireAuth } from '../auth/middleware.ts'
import { createAuthRouter } from '../auth/routes.ts'
import { createAuthService } from '../auth/service.ts'
import { createSessionRepository } from '../auth/sessionRepository.ts'
import { createLoginThrottle } from '../auth/throttle.ts'
import { createUserRepository } from '../auth/userRepository.ts'
import { createCartRepository } from '../cart/repository.ts'
import { createCartRouter } from '../cart/routes.ts'
import { createCartService } from '../cart/service.ts'
import type { Database } from '../db/database.ts'
import { HttpError } from '../lib/httpError.ts'
import { createOrderRepository } from '../orders/repository.ts'
import { createOrdersRouter } from '../orders/routes.ts'
import { createOrderService } from '../orders/service.ts'
import { createProductRepository } from '../products/repository.ts'
import { createCategoriesRouter, createProductsRouter } from '../products/routes.ts'
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

/** Everything under /api. New feature routers are mounted here. */
export function createApiRouter(database: Database | null) {
  const router = Router()

  router.use(createHealthRouter(database))

  const products = database ? createProductRepository(database) : null
  const auth = database
    ? createAuthService({
        users: createUserRepository(database),
        sessions: createSessionRepository(database),
        // One for the whole process: it is what counts the failed sign-ins.
        throttle: createLoginThrottle(),
      })
    : null

  const productService = products ? createProductService(products) : null
  router.use(
    '/products',
    productService ? createProductsRouter(productService) : databaseNotConfigured,
  )
  router.use(
    '/categories',
    productService ? createCategoriesRouter(productService) : databaseNotConfigured,
  )

  router.use('/auth', auth ? createAuthRouter(auth) : databaseNotConfigured)

  // The same authentication service as /auth, so a session is one thing for every route.
  router.use(
    '/orders',
    database && products && auth
      ? createOrdersRouter(
          createOrderService({ orders: createOrderRepository(database), products }),
          createRequireAuth(auth),
        )
      : databaseNotConfigured,
  )

  router.use(
    '/cart',
    database && products && auth
      ? createCartRouter(
          createCartService({ carts: createCartRepository(database), products }),
          createRequireAuth(auth),
        )
      : databaseNotConfigured,
  )

  return router
}
