import { Router } from 'express'

export const healthRouter = Router()

/** For load balancers, uptime checks and the frontend: is the API up? */
healthRouter.get('/health', (_req, res) => {
  // A health answer must never come from a cache.
  res.set('Cache-Control', 'no-store')
  res.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})
