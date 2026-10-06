import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { createAuthRouter } from '../../server/src/auth/routes'
import { createAuthService } from '../../server/src/auth/service'
import { createLoginThrottle } from '../../server/src/auth/throttle'
import { errorHandler } from '../../server/src/middleware/errorHandler'
import { notFound } from '../../server/src/middleware/notFound'
import { listen } from '../../server/src/testing/listen'
import {
  createMemorySessionRepository,
  createMemoryUserRepository,
} from '../../server/src/testing/memoryAuthRepositories'
import express from 'express'

/** Where the storefront looks for the API while it is developed and tested (src/lib/api.ts). */
const API_BASE = 'http://localhost:3001'

/**
 * The authentication API for the UI tests: the real API code (routes, validation, the password
 * hashing, sessions, the middleware, the error handling) over accounts and sessions kept in
 * memory, listening on a free port. The storefront's own requests reach it, so these tests
 * exercise what the page sends and what comes back for real, not a script.
 *
 * Call it once at the top of a test file. Every test starts with no accounts and no sessions.
 */
export function setUpAuthApi() {
  const realFetch = globalThis.fetch
  let server: Awaited<ReturnType<typeof listen>>
  let users = createMemoryUserRepository()
  let sessions = createMemorySessionRepository()
  let service = build()

  function build() {
    return createAuthService({
      users: users.repository,
      sessions: sessions.repository,
      throttle: createLoginThrottle(),
    })
  }

  const app = express()
  app.use(express.json())
  app.use(
    '/api/auth',
    createAuthRouter({
      register: (input) => service.register(input),
      login: (input) => service.login(input),
      authenticate: (token) => service.authenticate(token),
      logout: (token) => service.logout(token),
    }),
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
  }
}
