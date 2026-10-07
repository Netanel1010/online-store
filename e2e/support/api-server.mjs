// The API for the E2E tests (products, authentication, orders and carts), without a database.
//
// It is the real API code (routes, service, validation, paging, hashing, sessions, error format)
// over the in-memory repositories the server's own tests use. The products are the same catalog
// that `npm run seed:products` copies to MongoDB (public/data/products.json); the accounts and
// sessions start empty and every test registers its own. So the browser tests exercise the real
// contract, across two origins like the deployed site and API, and CI needs no MongoDB. Node runs
// the server's TypeScript files directly.
import { readFileSync } from 'node:fs'
import cors from 'cors'
import express from 'express'
import { createRequireAuth } from '../../server/src/auth/middleware.ts'
import { createAuthRouter, NO_AUTH_RATE_LIMITS } from '../../server/src/auth/routes.ts'
import { createAuthService } from '../../server/src/auth/service.ts'
import { createLoginThrottle } from '../../server/src/auth/throttle.ts'
import { createConcurrencyGate } from '../../server/src/lib/concurrencyGate.ts'
import { errorHandler } from '../../server/src/middleware/errorHandler.ts'
import { notFound } from '../../server/src/middleware/notFound.ts'
import { createCartRouter, NO_CART_RATE_LIMITS } from '../../server/src/cart/routes.ts'
import { createCartService } from '../../server/src/cart/service.ts'
import { createOrdersRouter, NO_ORDER_RATE_LIMITS } from '../../server/src/orders/routes.ts'
import { createOrderService } from '../../server/src/orders/service.ts'
import { createProductsRouter } from '../../server/src/products/routes.ts'
import { validateCatalog } from '../../server/src/products/seed.ts'
import { createProductService } from '../../server/src/products/service.ts'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../../server/src/testing/memoryAuthRepositories.ts'
import { createMemoryCartRepository } from '../../server/src/testing/memoryCartRepository.ts'
import { createMemoryOrderRepository } from '../../server/src/testing/memoryOrderRepository.ts'
import { createMemoryProductRepository } from '../../server/src/testing/memoryProductRepository.ts'

const port = Number(process.env.E2E_API_PORT ?? 4174)
const sitePort = Number(process.env.E2E_PORT ?? 4173)

const source = JSON.parse(
  readFileSync(new URL('../../public/data/products.json', import.meta.url), 'utf8'),
)
const { repository } = createMemoryProductRepository(validateCatalog(source))

const app = express()
// The site and the API are on different ports, like the site and the API of `npm run dev`.
app.use(cors({ origin: [`http://localhost:${sitePort}`] }))
app.use(express.json({ limit: '100kb' }))
app.use('/api/products', createProductsRouter(createProductService(repository)))
const auth = createAuthService({
  users: createMemoryUserRepository().repository,
  sessions: createMemorySessionRepository().repository,
  throttle: createLoginThrottle(),
  // Many tests register at once from one address: no per-address limits and a roomy hash line.
  hashGate: createConcurrencyGate({ maxConcurrent: 4, maxQueued: 256 }),
})
app.use('/api/auth', createAuthRouter(auth, NO_AUTH_RATE_LIMITS))
// Orders are priced from the same products the catalog serves, and belong to the account of the
// session. Every test registers its own account, so no order is visible to another test.
app.use(
  '/api/orders',
  createOrdersRouter(
    createOrderService({
      orders: createMemoryOrderRepository().repository,
      products: repository,
    }),
    createRequireAuth(auth),
    NO_ORDER_RATE_LIMITS,
  ),
)
// The cart of an account, kept in memory like everything here: it survives a reload and a new sign-in
// (the tests run against one API process), and no cart is visible to another test's account.
app.use(
  '/api/cart',
  createCartRouter(
    createCartService({ carts: createMemoryCartRepository().repository, products: repository }),
    createRequireAuth(auth),
    NO_CART_RATE_LIMITS,
  ),
)
app.use(notFound)
app.use(errorHandler(console))

app.listen(port, () => console.log(`E2E products API on http://localhost:${port}`))
