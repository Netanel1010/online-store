import { HttpError } from '../lib/httpError.ts'
import type { ProductRepository } from './repository.ts'
import type { Product, ProductPage } from './types.ts'

export const DEFAULT_LIMIT = 20
/** A page is never larger than this, however much a client asks for. */
export const MAX_LIMIT = 100

/** The one answer to a page or a limit that is not allowed, wherever it is noticed. */
export const invalidPagination = () =>
  new HttpError(
    400,
    'invalid_pagination',
    `page must be a positive integer and limit an integer from 1 to ${MAX_LIMIT}`,
  )

export interface ProductService {
  list(params?: { page?: number; limit?: number }): Promise<ProductPage>
  get(id: string): Promise<Product>
}

/**
 * The rules of the product API: how paging works and what it means to look a product up. It talks
 * to the repository, never to MongoDB, and knows nothing about Express. A failure the client
 * caused is thrown as an `HttpError`, so the central error handler answers it.
 */
export function createProductService(
  repository: Pick<ProductRepository, 'list' | 'findById'>,
): ProductService {
  return {
    async list({ page = 1, limit = DEFAULT_LIMIT } = {}) {
      const skip = (page - 1) * limit
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_LIMIT ||
        !Number.isSafeInteger(skip)
      ) {
        throw invalidPagination()
      }

      const { items, total } = await repository.list({ skip, limit })
      // A page past the end is not an error: it is empty, and the total says where the end is.
      return { items, page, limit, total, totalPages: Math.ceil(total / limit) }
    },

    async get(id) {
      const product = await repository.findById(id)
      if (product === null) throw new HttpError(404, 'product_not_found', 'Product not found')
      return product
    },
  }
}
