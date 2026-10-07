import type { CategoryId } from '@/features/products/categories'
import type { Product } from '@/features/products/schema'
import {
  idsPath,
  listingPath,
  sectionPath,
  suggestionsPath,
  type ListingRequest,
  type ProductListing,
} from '@/services/productService'
import { parseProductListQuery } from '../../server/src/products/listQuery'
import { createProductService } from '../../server/src/products/service'
import { createMemoryProductRepository } from '../../server/src/testing/memoryProductRepository'

/** The query string of an address as Express reads it: a parameter that is repeated becomes a list. */
function queryOf(path: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {}
  for (const [key, value] of new URL(path, 'http://api.test').searchParams) {
    const current = query[key]
    query[key] = current === undefined ? value : [current].flat().concat(value)
  }
  return query
}

/**
 * What the storefront asks the API for, answered by the real API code (the parsing of the query
 * string, the search, the filters, the sort, the filter options, the lookup by id, the counts) over
 * the given products in memory, reached through the storefront's own request paths. So these tests
 * exercise what the page sends and what it gets back for real, not a script, and no filtering logic
 * is written a second time.
 */
export function fakeCatalogApi(catalog: readonly Product[]) {
  const service = createProductService(createMemoryProductRepository(catalog).repository)
  const items = async (path: string) =>
    (await service.list(parseProductListQuery(queryOf(path)))).items

  return {
    listing: async (request: ListingRequest): Promise<ProductListing> => {
      const page = await service.list(parseProductListQuery(queryOf(listingPath(request, 1, true))))
      if (!page.facets) throw new Error('the API did not return the filter options')
      return { products: page.items, total: page.total, facets: page.facets }
    },
    byIds: (ids: readonly string[]) => items(idsPath(ids)),
    sale: () => items(sectionPath('sale', 1)),
    recommended: () => items(sectionPath('recommended', 1)),
    suggestions: (text: string) => items(suggestionsPath(text)),
    categoryCounts: async (): Promise<ReadonlyMap<CategoryId, number>> =>
      new Map((await service.categoryCounts()).map(({ category, count }) => [category, count])),
  }
}

/** Only the listing of a page, as the pages that ask for nothing else use it. */
export const fakeListingApi = (catalog: readonly Product[]) => fakeCatalogApi(catalog).listing
