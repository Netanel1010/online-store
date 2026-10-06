import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'
import type { Product } from '@/features/products/schema'
import { resetProductCatalog } from '@/features/products/useProductCatalog'
import * as productService from '@/services/productService'
import { fakeListingApi } from './fakeListingApi'
import { RouterProbe } from './RouterProbe'

/**
 * Renders the whole app at `path` (which may include a query string) with a mocked catalog: the
 * whole list (cart, favorites, home, navigation), the same products by id for the product page, and
 * the listing pages, which ask the API for what they show. That API is the real API code over the
 * same products (see fakeListingApi).
 */
export function renderApp(path: string, catalog: Product[] | Error = []) {
  resetProductCatalog()
  const fetchProducts = vi.spyOn(productService, 'fetchProducts')
  const fetchProduct = vi.spyOn(productService, 'fetchProduct')
  const fetchProductListing = vi.spyOn(productService, 'fetchProductListing')
  if (catalog instanceof Error) {
    fetchProducts.mockRejectedValue(catalog)
    fetchProduct.mockRejectedValue(catalog)
    fetchProductListing.mockRejectedValue(catalog)
  } else {
    fetchProducts.mockResolvedValue(catalog)
    fetchProduct.mockImplementation((id) =>
      Promise.resolve(catalog.find((product) => product.id === id) ?? null),
    )
    fetchProductListing.mockImplementation(fakeListingApi(catalog))
  }

  return {
    fetchProducts,
    fetchProduct,
    fetchProductListing,
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <RouterProbe />
      </MemoryRouter>,
    ),
  }
}
