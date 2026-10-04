import { assetUrl } from '@/lib/assets'
import { productsSchema, type Product } from '@/features/products/schema'

export class ProductDataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProductDataError'
  }
}

/**
 * Loads and validates the product catalog.
 *
 * This is the only place that knows where product data comes from. Replacing the static
 * JSON file with a real API later only requires changing this function.
 */
export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  let response: Response
  try {
    response = await fetch(assetUrl('data/products.json'), { signal })
  } catch (cause) {
    throw new ProductDataError('Could not reach the product catalog', { cause })
  }
  if (!response.ok) {
    throw new ProductDataError(`Product catalog request failed with status ${response.status}`)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    throw new ProductDataError('Product catalog is not valid JSON', { cause })
  }

  const result = productsSchema.safeParse(payload)
  if (!result.success) {
    throw new ProductDataError('Product catalog failed validation', { cause: result.error })
  }
  return result.data
}
