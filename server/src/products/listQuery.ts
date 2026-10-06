import { z } from 'zod'
import { BRAND_IDS, type BrandId } from '../../../src/features/products/brands.ts'
import { CATEGORY_IDS, type CategoryId } from '../../../src/features/products/categories.ts'
import {
  MAX_QUERY_LENGTH,
  MAX_SPEC_VALUES,
  SORT_KEYS,
  SPEC_PREFIX,
  type SortKey,
} from '../../../src/features/products/listing/query.ts'
import { HttpError } from '../lib/httpError.ts'
import { parsePaginationQuery } from './schemas.ts'

/** The longest specification label or value the API reads. */
const MAX_SPEC_TEXT_LENGTH = 100

/**
 * What a client can ask `GET /api/products` for, validated. The limits are those of the
 * storefront's own URL parsing (listing/query.ts), which the storefront applies before it asks, so
 * a request the storefront makes is never refused for its size.
 */
export interface ProductListQuery {
  page?: number
  limit?: number
  /** The search text, trimmed. Empty means no search. */
  q: string
  category: CategoryId | undefined
  /** In the order of the brand registry, without repeats. */
  brands: BrandId[]
  /** The selected values of each specification label. A Map: a label may be any text. */
  specs: Map<string, string[]>
  sort: SortKey
  /** Whether the answer also carries the filter options with their counts. */
  facets: boolean
}

/** A parameter that may be repeated (`brand=amd&brand=intel`) reaches us as a string or an array. */
const oneOrMore = z.union([z.string(), z.array(z.string())]).transform((value) => [value].flat())

const listQuerySchema = z.object({
  q: z
    .string()
    .transform((text) => text.trim())
    .pipe(z.string().max(MAX_QUERY_LENGTH))
    .default(''),
  category: z.enum(CATEGORY_IDS).optional(),
  brand: oneOrMore.pipe(z.array(z.enum(BRAND_IDS))).default([]),
  sort: z.enum(SORT_KEYS).default('default'),
  facets: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
})

const invalidQuery = (parameter: string) =>
  new HttpError(400, 'invalid_query', `The query parameter "${parameter}" is not valid`)

const specValueSchema = z.string().min(1).max(MAX_SPEC_TEXT_LENGTH)

/** `?s.<label>=<value>`, repeated per value. Every other parameter is somebody else's. */
function parseSpecs(query: Record<string, unknown>): Map<string, string[]> {
  const specs = new Map<string, string[]>()
  let count = 0
  for (const [key, raw] of Object.entries(query)) {
    if (!key.startsWith(SPEC_PREFIX)) continue
    const label = key.slice(SPEC_PREFIX.length)
    if (label === '' || label.length > MAX_SPEC_TEXT_LENGTH) throw invalidQuery('s.<label>')
    const parsed = oneOrMore.pipe(z.array(specValueSchema)).safeParse(raw)
    if (!parsed.success) throw invalidQuery('s.<label>')
    const values = [...new Set(parsed.data)]
    count += values.length
    if (count > MAX_SPEC_VALUES) throw invalidQuery('s.<label>')
    specs.set(label, values)
  }
  return specs
}

/** Turns the query string of `GET /api/products` into a `ProductListQuery`, or a 400. */
export function parseProductListQuery(query: unknown): ProductListQuery {
  // The pagination keeps its own error, which clients already know.
  const pagination = parsePaginationQuery(query)

  const source = (typeof query === 'object' && query !== null ? query : {}) as Record<
    string,
    unknown
  >
  const result = listQuerySchema.safeParse(source)
  if (!result.success) {
    const parameter = result.error.issues[0]?.path[0]
    throw invalidQuery(typeof parameter === 'string' ? parameter : 'query')
  }
  const { q, category, brand, sort, facets } = result.data

  return {
    ...pagination,
    q,
    category,
    brands: BRAND_IDS.filter((id) => brand.includes(id)),
    specs: parseSpecs(source),
    sort,
    facets,
  }
}
