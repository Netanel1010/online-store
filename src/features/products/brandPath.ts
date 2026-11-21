import { paths } from '@/app/paths'
import type { BrandId } from './brands'
import { emptyListingState, serializeListingState, toggleBrand } from './listing/query'

/**
 * The listing of one brand's products: the URL the filters themselves write when only that
 * brand is checked. It is built by the same serializer, so it cannot drift from the listing page.
 * Lives in its own file (not in `brands.ts` or `query.ts`) to avoid a circular import.
 */
export function brandListingPath(id: BrandId): string {
  const params = serializeListingState(toggleBrand(emptyListingState, id))
  return `${paths.products}?${params.toString()}`
}
