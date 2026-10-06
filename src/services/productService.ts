import { z } from 'zod'
import type { CategoryId } from '@/features/products/categories'
import { listingFacetsSchema, type ListingFacets } from '@/features/products/listing/facets'
import { SPEC_PREFIX, type ListingState } from '@/features/products/listing/query'
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

/** What a listing page asks the API for: the visitor's search, filters and sort, in a category or not. */
export interface ListingRequest extends ListingState {
  category?: CategoryId
}

/** The products of a listing, how many there are, and the filter options to show next to them. */
export interface ProductListing {
  products: Product[]
  total: number
  facets: ListingFacets
}

/**
 * The address of one page of a listing. The search text and the selections are encoded by
 * URLSearchParams, so whatever the visitor typed stays a value and cannot add a parameter. The
 * filter options (`facets`) are asked for once, with the first page: they do not depend on the page.
 */
export function listingPath(request: ListingRequest, page: number, withFacets: boolean): string {
  const params = new URLSearchParams()
  if (request.q !== '') params.set('q', request.q)
  if (request.category) params.set('category', request.category)
  for (const brand of request.brands) params.append('brand', brand)
  for (const [label, values] of request.specs) {
    for (const value of values) params.append(`${SPEC_PREFIX}${label}`, value)
  }
  if (request.sort !== 'default') params.set('sort', request.sort)
  if (withFacets) params.set('facets', 'true')
  params.set('page', String(page))
  params.set('limit', String(PAGE_SIZE))
  return `/api/products?${params}`
}

const listingPageSchema = pageSchema.extend({
  total: z.number().int().min(0),
  facets: listingFacetsSchema.optional(),
})

/**
 * Loads one listing from `GET /api/products`: the products that match the request, in the order
 * the API gives them (the order of the sort, or the best match first for a search), following the
 * pagination until the last page. The searching, filtering and sorting all happen in the API.
 */
export async function fetchProductListing(
  request: ListingRequest,
  signal?: AbortSignal,
): Promise<ProductListing> {
  const fetchPage = async (page: number) => {
    const response = await get(listingPath(request, page, page === 1), signal)
    requireOk(response)
    return validate(listingPageSchema, await readJson(response))
  }

  const first = await fetchPage(1)
  if (first.facets === undefined) {
    throw new ProductDataError('Product listing has no filter options')
  }
  if (first.totalPages > MAX_PAGES) {
    throw new ProductDataError(`Product catalog has too many pages (${first.totalPages})`)
  }
  const rest = await Promise.all(
    Array.from({ length: Math.max(first.totalPages - 1, 0) }, (_, index) => fetchPage(index + 2)),
  )

  return {
    products: validate(
      productsSchema,
      [first, ...rest].flatMap((page) => page.items),
    ),
    total: first.total,
    facets: first.facets,
  }
}
