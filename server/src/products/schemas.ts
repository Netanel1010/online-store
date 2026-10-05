import { z } from 'zod'
import { productsSchema } from '../../../src/features/products/schema.ts'
import { HttpError } from '../lib/httpError.ts'
import { invalidPagination } from './service.ts'

/**
 * What the API accepts as a product id: a manufacturer SKU as in the catalog (`CC-9011240-WW`).
 * The catalog schema itself allows any non-empty text, so the seed checks every id against this
 * too, and no stored product can be one the API cannot address.
 */
export const productIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)

export function parseProductId(value: unknown): string {
  const result = productIdSchema.safeParse(value)
  if (!result.success) {
    throw new HttpError(400, 'invalid_product_id', 'The product id is not valid')
  }
  return result.data
}

// Only the format is checked here: a single value made of digits. The ranges are the service's rules.
const digits = z
  .string()
  .regex(/^\d{1,9}$/)
  .transform(Number)

const paginationQuerySchema = z.object({ page: digits.optional(), limit: digits.optional() })

/** Turns `?page=2&limit=10` into numbers. Other parameters are ignored. */
export function parsePaginationQuery(query: unknown): { page?: number; limit?: number } {
  const result = paginationQuerySchema.safeParse(query)
  if (!result.success) throw invalidPagination()
  return result.data
}

/** The seed's source: the canonical product list, not empty, with ids the API can serve. */
export const catalogSchema = productsSchema
  .min(1, { message: 'the catalog has no products' })
  .superRefine((products, ctx) => {
    products.forEach((product, index) => {
      if (!productIdSchema.safeParse(product.id).success) {
        ctx.addIssue({
          code: 'custom',
          message: `product id "${product.id}" cannot be used in the API: use letters, digits, ".", "_" and "-", up to 64 characters`,
          path: [index, 'id'],
        })
      }
    })
  })
