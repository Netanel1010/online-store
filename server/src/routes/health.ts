import { Router } from 'express'
import type { Database } from '../db/database.ts'

/**
 * Two questions, kept apart on purpose:
 * - `/health`: is this process up? It never touches the database, so a database that is down
 *   cannot make a host restart a server that is fine.
 * - `/health/ready`: can it do its work? It also asks the database. The answer only says whether
 *   the database is up, never why it is not: no connection details leave the server.
 */
export function createHealthRouter(database: Database | null) {
  const router = Router()

  router.get('/health', (_req, res) => {
    // A health answer must never come from a cache.
    res.set('Cache-Control', 'no-store')
    res.json({
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    })
  })

  router.get('/health/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store')

    // Running without a database is a valid setup in development, not a failure.
    if (database === null) {
      res.json({ status: 'ok', database: 'not_configured' })
      return
    }

    const up = await database.ping()
    res.status(up ? 200 : 503).json({
      status: up ? 'ok' : 'unavailable',
      database: up ? 'up' : 'down',
    })
  })

  return router
}
