import type { Product } from '@/features/products/schema'
import { listingPath, type ListingRequest, type ProductListing } from '@/services/productService'
import { parseProductListQuery } from '../../server/src/products/listQuery'
import { createProductService } from '../../server/src/products/service'
import { createMemoryProductRepository } from '../../server/src/testing/memoryProductRepository'

/**
 * The listing API for the UI tests: the real API code (the parsing of the query string, the
 * search, the filters, the sort, the filter options) over the given products in memory, reached
 * through the storefront's own request path. So these tests exercise what the page sends and
 * what it gets back for real, not a script, and no filtering logic is written a second time.
 */
export function fakeListingApi(catalog: readonly Product[]) {
  const service = createProductService(createMemoryProductRepository(catalog).repository)

  return async (request: ListingRequest): Promise<ProductListing> => {
    // The query string as Express reads it: a parameter that is repeated becomes a list.
    const query: Record<string, string | string[]> = {}
    const url = new URL(listingPath(request, 1, true), 'http://api.test')
    for (const [key, value] of url.searchParams) {
      const current = query[key]
      query[key] = current === undefined ? value : [current].flat().concat(value)
    }

    const page = await service.list(parseProductListQuery(query))
    if (!page.facets) throw new Error('the API did not return the filter options')
    return { products: page.items, total: page.total, facets: page.facets }
  }
}
