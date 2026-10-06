import { Router } from 'express'
import { parseProductListQuery } from './listQuery.ts'
import { parseProductId } from './schemas.ts'
import type { ProductService } from './service.ts'

/**
 * How long a browser may keep an answer. The catalog changes rarely, and the API runs on a host that
 * falls asleep: for a minute a repeated read is answered without asking, and for an hour after that
 * the browser shows what it has at once while it asks again in the background (which also wakes the
 * host). A returning visitor therefore does not wait for a sleeping API. It is set on a successful
 * answer only, so an error is never kept.
 */
export const PRODUCT_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=3600'

/** HTTP only: read the request, call the service, send what it returns. */
export function createProductsRouter(service: ProductService) {
  const router = Router()

  router.get('/', async (req, res) => {
    const page = await service.list(parseProductListQuery(req.query))
    res.set('Cache-Control', PRODUCT_CACHE_CONTROL).json(page)
  })

  router.get('/:id', async (req, res) => {
    const product = await service.get(parseProductId(req.params.id))
    res.set('Cache-Control', PRODUCT_CACHE_CONTROL).json(product)
  })

  return router
}
