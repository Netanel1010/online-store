import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'
import type { Product } from '@/features/products/schema'
import { resetProductCatalog } from '@/features/products/useProductCatalog'
import * as productService from '@/services/productService'
import { RouterProbe } from './RouterProbe'

/**
 * Renders the whole app at `path` (which may include a query string) with a mocked catalog: the
 * list for the listing pages, and the same products by id for the product page.
 */
export function renderApp(path: string, catalog: Product[] | Error = []) {
  resetProductCatalog()
  const fetchProducts = vi.spyOn(productService, 'fetchProducts')
  const fetchProduct = vi.spyOn(productService, 'fetchProduct')
  if (catalog instanceof Error) {
    fetchProducts.mockRejectedValue(catalog)
    fetchProduct.mockRejectedValue(catalog)
  } else {
    fetchProducts.mockResolvedValue(catalog)
    fetchProduct.mockImplementation((id) =>
      Promise.resolve(catalog.find((product) => product.id === id) ?? null),
    )
  }

  return {
    fetchProducts,
    fetchProduct,
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <RouterProbe />
      </MemoryRouter>,
    ),
  }
}
