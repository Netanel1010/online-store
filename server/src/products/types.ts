import type { Product } from '../../../src/features/products/schema.ts'

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
}

/** What a seed run did to the collection, counted by product. */
export interface UpsertResult {
  inserted: number
  updated: number
  unchanged: number
}
