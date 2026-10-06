import { z } from 'zod'
import { productSchema, productsSchema, type Product } from '@/features/products/schema'
import { apiUrl } from '@/lib/api'

export class ProductDataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProductDataError'
  }
}

/** The API's largest page, so the whole catalog takes as few requests as possible. */
const PAGE_SIZE = 100
/** A safety net against a server that never stops paging. */
const MAX_PAGES = 50

const pageSchema = z.object({
  items: z.array(productSchema),
  totalPages: z.number().int().min(0),
})

async function get(path: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(apiUrl(path), { signal })
  } catch (cause) {
    throw new ProductDataError('Could not reach the product catalog', { cause })
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (cause) {
    throw new ProductDataError('Product catalog is not valid JSON', { cause })
  }
}

function validate<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload)
  if (!result.success) {
    throw new ProductDataError('Product catalog failed validation', { cause: result.error })
  }
  return result.data
}

function requireOk(response: Response) {
  if (!response.ok) {
    throw new ProductDataError(`Product catalog request failed with status ${response.status}`)
  }
}

/**
 * Loads and validates the whole product catalog from `GET /api/products`, following the API's
 * pagination until the last page. The pages after the first are requested together.
 *
 * The storefront searches, filters and counts products in the browser, and there is no search or
 * filter API yet, so it needs every product at once.
 */
export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  const fetchPage = async (page: number) => {
    const response = await get(`/api/products?page=${page}&limit=${PAGE_SIZE}`, signal)
    requireOk(response)
    return validate(pageSchema, await readJson(response))
  }

  const first = await fetchPage(1)
  if (first.totalPages > MAX_PAGES) {
    throw new ProductDataError(`Product catalog has too many pages (${first.totalPages})`)
  }
  const rest = await Promise.all(
    Array.from({ length: Math.max(first.totalPages - 1, 0) }, (_, index) => fetchPage(index + 2)),
  )

  // The same check the catalog has always had, now across pages: no product twice.
  return validate(
    productsSchema,
    [first, ...rest].flatMap((page) => page.items),
  )
}

/**
 * Loads one product from `GET /api/products/:id`, or null when there is no such product.
 * The API answers 400 for an id it cannot hold and 404 for one it does not have; to a visitor
 * following a link both mean the same thing.
 */
export async function fetchProduct(id: string, signal?: AbortSignal): Promise<Product | null> {
  const response = await get(`/api/products/${encodeURIComponent(id)}`, signal)
  if (response.status === 404 || response.status === 400) return null
  requireOk(response)
  return validate(productSchema, await readJson(response))
}
