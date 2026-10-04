import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'
import type { Product } from '@/features/products/schema'
import { resetProductCatalog } from '@/features/products/useProductCatalog'
import * as productService from '@/services/productService'
import { RouterProbe } from './RouterProbe'

/** Renders the whole app at `path` (which may include a query string) with a mocked catalog. */
export function renderApp(path: string, catalog: Product[] | Error = []) {
  resetProductCatalog()
  const fetchProducts = vi.spyOn(productService, 'fetchProducts')
  if (catalog instanceof Error) fetchProducts.mockRejectedValue(catalog)
  else fetchProducts.mockResolvedValue(catalog)

  return {
    fetchProducts,
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <RouterProbe />
      </MemoryRouter>,
    ),
  }
}
