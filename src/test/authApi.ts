import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { createRequireAuth } from '../../server/src/auth/middleware'
import { createAuthRouter, NO_AUTH_RATE_LIMITS } from '../../server/src/auth/routes'
import { createAuthService } from '../../server/src/auth/service'
import { createLoginThrottle } from '../../server/src/auth/throttle'
import { createConcurrencyGate } from '../../server/src/lib/concurrencyGate'
import { errorHandler } from '../../server/src/middleware/errorHandler'
import { notFound } from '../../server/src/middleware/notFound'
import { createOrdersRouter, NO_ORDER_RATE_LIMITS } from '../../server/src/orders/routes'
import { createOrderService } from '../../server/src/orders/service'
import { listen } from '../../server/src/testing/listen'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../../server/src/testing/memoryAuthRepositories'
import { createMemoryOrderRepository } from '../../server/src/testing/memoryOrderRepository'
import { createMemoryProductRepository } from '../../server/src/testing/memoryProductRepository'
import type { Product } from '@/features/products/schema'
import express from 'express'

/** Where the storefront looks for the API while it is developed and tested (src/lib/api.ts). */
const API_BASE = 'http://localhost:3001'

/**
 * The authentication and orders API for the UI tests: the real API code (routes, validation, the
 * password hashing, sessions, the middleware, the order pricing and idempotency, the error handling)
 * over accounts, sessions, orders and products kept in memory, listening on a free port. The storefront's own requests reach it, so these tests
 * exercise what the page sends and what comes back for real, not a script.
 *
 * Call it once at the top of a test file. Every test starts with no accounts, no sessions, no orders
 * and an empty catalog (`setCatalog` gives the API the products that orders are priced from).
 */
export function setUpAuthApi() {
  const realFetch = globalThis.fetch
  let server: Awaited<ReturnType<typeof listen>>
  let users = createMemoryUserRepository()
  let sessions = createMemorySessionRepository()
  let service = build()
  let orders = createMemoryOrderRepository()
  let catalog = createMemoryProductRepository()
  let orderService = buildOrders()

  function build() {
    return createAuthService({
      users: users.repository,
      sessions: sessions.repository,
      throttle: createLoginThrottle(),
      hashGate: createConcurrencyGate({ maxConcurrent: 4, maxQueued: 256 }),
    })
  }

  function buildOrders() {
    return createOrderService({ orders: orders.repository, products: catalog.repository })
  }

  const app = express()
  app.use(express.json())
  app.use(
    '/api/auth',
    createAuthRouter(
      {
        register: (input) => service.register(input),
        login: (input) => service.login(input),
        authenticate: (token) => service.authenticate(token),
        logout: (token) => service.logout(token),
        logoutAll: (userId) => service.logoutAll(userId),
      },
      NO_AUTH_RATE_LIMITS,
    ),
  )
  app.use(
    '/api/orders',
    createOrdersRouter(
      {
        place: (userId, input, key) => orderService.place(userId, input, key),
        get: (userId, orderNumber) => orderService.get(userId, orderNumber),
        list: (userId, params) => orderService.list(userId, params),
      },
      createRequireAuth({ authenticate: (token) => service.authenticate(token) }),
      NO_ORDER_RATE_LIMITS,
    ),
  )
  app.use(notFound)
  app.use(errorHandler({ error: () => {} }))

  beforeAll(async () => {
    server = await listen(app)
  })
  afterAll(() => server.close())

  beforeEach(() => {
    users = createMemoryUserRepository()
    sessions = createMemorySessionRepository()
    service = build()
    orders = createMemoryOrderRepository()
    catalog = createMemoryProductRepository()
    orderService = buildOrders()
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input).replace(API_BASE, server.url)
      return realFetch(url, init)
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  return {
    /** Every session ends, as if they had all expired or been ended elsewhere. */
    endAllSessions: () => sessions.stored.clear(),
    accounts: () => users.stored,
    sessions: () => sessions.stored,
    /** The products that the API prices orders from (the catalog the page shows, as a rule). */
    setCatalog: (products: readonly Product[]) => {
      catalog = createMemoryProductRepository(products)
      orderService = buildOrders()
    },
    /** The orders the API has stored, in the order they were placed. */
    orders: () => orders.stored,
  }
}
