import { Router } from 'express'
import { healthRouter } from './health.ts'

/** Everything under /api. New feature routers (products, auth, orders) are mounted here. */
export const apiRouter = Router()

apiRouter.use(healthRouter)
