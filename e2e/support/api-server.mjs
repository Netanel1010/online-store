// The Products API for the E2E tests, without a database.
//
// It is the real API code (routes, service, validation, paging, error format) over the in-memory
// repository the server's own tests use, filled from the same catalog that `npm run seed:products`
// copies to MongoDB (public/data/products.json). So the browser tests exercise the real contract,
// and CI needs no MongoDB. Node runs the server's TypeScript files directly.
import { readFileSync } from 'node:fs'
import cors from 'cors'
import express from 'express'
import { errorHandler } from '../../server/src/middleware/errorHandler.ts'
import { notFound } from '../../server/src/middleware/notFound.ts'
import { createProductsRouter } from '../../server/src/products/routes.ts'
import { validateCatalog } from '../../server/src/products/seed.ts'
import { createProductService } from '../../server/src/products/service.ts'
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
app.use('/api/products', createProductsRouter(createProductService(repository)))
app.use(notFound)
app.use(errorHandler(console))

app.listen(port, () => console.log(`E2E products API on http://localhost:${port}`))
