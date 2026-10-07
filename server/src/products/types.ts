import type { BrandId } from '../../../src/features/products/brands.ts'
import type { CategoryId } from '../../../src/features/products/categories.ts'
import type { SortKey } from '../../../src/features/products/listing/query.ts'
import type { Product } from '../../../src/features/products/schema.ts'
import type { Facets } from './facets.ts'

// The product model is defined once, by the storefront's Zod schema (src/features/products/schema.ts).
// The API validates the seed with it and returns exactly what it describes, so the two cannot drift.
export type { Product }

/** One page of the product list. */
export interface ProductPage {
  items: Product[]
  page: number
  limit: number
  /** Number of products in the whole collection. */
  total: number
  totalPages: number
  /** The filter options with their counts, only when they were asked for (`facets=true`). */
  facets?: Facets
}

/** What a seed run did to the collection, counted by product. */
export interface UpsertResult {
  inserted: number
  updated: number
  unchanged: number
}

/**
 * Which products a listing is about. Everything in it is already validated and sanitized (see
 * `listQuery.ts` and the service): the repository only turns it into a query.
 */
export interface ProductFilter {
  category?: CategoryId
  /** The search text and where to look: the core fields, or (`deep`) the specifications too. */
  search?: { query: string; deep: boolean }
  brands: readonly BrandId[]
  /** Selected values per specification label: a product has one of them, for every label. */
  specs: ReadonlyMap<string, readonly string[]>
  /** Only these products, by `id` (a lookup). Left out, every product qualifies. */
  ids?: readonly string[]
  /** Only the products that are on sale (they have an original price). */
  onSale?: boolean
  /** Only the recommended products. */
  recommended?: boolean
}

/** The order and the part of the matching products a page shows. */
export interface ProductRange {
  sort: SortKey
  skip: number
  limit: number
}

/** The number of products in a category (only the categories that have some). */
export interface CategoryCount {
  category: CategoryId
  count: number
}

export interface BrandCount {
  brand: BrandId
  count: number
}

/** The number of products that have this value for this specification label. */
export interface SpecValueCount {
  label: string
  value: string
  count: number
}
