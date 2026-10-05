import { Router } from 'express'
import { parsePaginationQuery, parseProductId } from './schemas.ts'
import type { ProductService } from './service.ts'

/** HTTP only: read the request, call the service, send what it returns. */
export function createProductsRouter(service: ProductService) {
  const router = Router()

  router.get('/', async (req, res) => {
    res.json(await service.list(parsePaginationQuery(req.query)))
  })

  router.get('/:id', async (req, res) => {
    res.json(await service.get(parseProductId(req.params.id)))
  })

  return router
}
