import { z } from 'zod'
import { CATEGORY_IDS, type CategoryId } from '@/features/products/categories'
import { listingFacetsSchema, type ListingFacets } from '@/features/products/listing/facets'
import { SPEC_PREFIX, type ListingState } from '@/features/products/listing/query'
import { productSchema, productsSchema, type Product } from '@/features/products/schema'
import { apiUrl } from '@/lib/api'
import { fetchWithRetry } from '@/lib/fetchWithRetry'

export class ProductDataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProductDataError'
  }
}

/** The API's largest page: the most that one request can ask for or answer. */
const PAGE_SIZE = 100
/** A safety net against a server that never stops paging. */
const MAX_PAGES = 50

const pageSchema = z.object({
  items: z.array(productSchema),
  totalPages: z.number().int().min(0),
})

async function get(path: string, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetchWithRetry(apiUrl(path), signal)
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

/** The products of the pages `pathOf` addresses, all of them: the first page, then the rest together. */
async function fetchEveryPage(
  pathOf: (page: number) => string,
  signal?: AbortSignal,
): Promise<Product[]> {
  const fetchPage = async (page: number) => {
    const response = await get(pathOf(page), signal)
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

  // No product twice, across pages.
  return validate(
    productsSchema,
    [first, ...rest].flatMap((page) => page.items),
  )
}

/** The address of a lookup by id: at most one page of products (see `fetchProductsByIds`). */
export function idsPath(ids: readonly string[]): string {
  const params = new URLSearchParams({ ids: ids.join(','), limit: String(PAGE_SIZE) })
  return `/api/products?${params}`
}

/** The address of the products on sale, or of the recommended ones, `page` of them. */
export function sectionPath(section: 'sale' | 'recommended', page: number): string {
  return `/api/products?${section}=true&page=${page}&limit=${PAGE_SIZE}`
}

/** How many products the search suggestions list. */
export const MAX_SUGGESTIONS = 5

/** The address of the suggestions for a search text: the first products of the search itself. */
export function suggestionsPath(text: string): string {
  const params = new URLSearchParams({ q: text, limit: String(MAX_SUGGESTIONS) })
  return `/api/products?${params}`
}

/**
 * Loads the products with these ids, in one request for every hundred (the API's largest page). An
 * id that has no product (it left the catalog) is simply not in the answer. The order of the answer
 * is the API's, not the order of `ids`.
 */
export async function fetchProductsByIds(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Product[]> {
  const unique = [...new Set(ids)]
  const chunks = Array.from({ length: Math.ceil(unique.length / PAGE_SIZE) }, (_, index) =>
    unique.slice(index * PAGE_SIZE, (index + 1) * PAGE_SIZE),
  )
  const found = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await get(idsPath(chunk), signal)
      requireOk(response)
      return validate(pageSchema, await readJson(response)).items
    }),
  )
  return validate(productsSchema, found.flat())
}

/** The products on sale: the ones the home page offers under "מבצעים". */
export function fetchSaleProducts(signal?: AbortSignal): Promise<Product[]> {
  return fetchEveryPage((page) => sectionPath('sale', page), signal)
}

/** The recommended products: the ones the home page offers under "מומלצים". */
export function fetchRecommendedProducts(signal?: AbortSignal): Promise<Product[]> {
  return fetchEveryPage((page) => sectionPath('recommended', page), signal)
}

/** The first products the API finds for a search text, best match first. */
export async function fetchSuggestions(text: string, signal?: AbortSignal): Promise<Product[]> {
  const response = await get(suggestionsPath(text), signal)
  requireOk(response)
  return validate(pageSchema, await readJson(response)).items
}

const categoryCountsSchema = z.object({
  items: z.array(z.object({ id: z.enum(CATEGORY_IDS), count: z.number().int().min(1) })),
})

/** How many products each category has (only the categories that have some). */
export async function fetchCategoryCounts(
  signal?: AbortSignal,
): Promise<ReadonlyMap<CategoryId, number>> {
  const response = await get('/api/categories', signal)
  requireOk(response)
  const { items } = validate(categoryCountsSchema, await readJson(response))
  return new Map(items.map(({ id, count }) => [id, count]))
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
