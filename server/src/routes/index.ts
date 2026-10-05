import { Router } from 'express'
import type { Database } from '../db/database.ts'
import { createHealthRouter } from './health.ts'

/** Everything under /api. New feature routers (products, auth, orders) are mounted here. */
export function createApiRouter(database: Database | null) {
  const router = Router()

  router.use(createHealthRouter(database))

  return router
}
