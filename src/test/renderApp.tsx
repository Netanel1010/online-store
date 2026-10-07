import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'
import type { Product } from '@/features/products/schema'
import * as productService from '@/services/productService'
import { fakeCatalogApi } from './fakeListingApi'
import { RouterProbe } from './RouterProbe'

/**
 * Renders the whole app at `path` (which may include a query string) with a mocked catalog: the
 * products by id (cart, favorites, checkout), the home sections, the category counts, the search
 * suggestions, the same products by id for the product page, and the listing pages, which ask the
 * API for what they show. All of those are the real API code over the same products (see
 * fakeCatalogApi). With an Error, every one of them fails; `failing` makes only some of them fail.
 */
export function renderApp(
  path: string,
  catalog: Product[] | Error = [],
  {
    failing = [],
  }: { failing?: ('categoryCounts' | 'suggestions' | 'sale' | 'recommended')[] } = {},
) {
  const fetchProduct = vi.spyOn(productService, 'fetchProduct')
  const fetchProductListing = vi.spyOn(productService, 'fetchProductListing')
  const fetchProductsByIds = vi.spyOn(productService, 'fetchProductsByIds')
  const fetchSaleProducts = vi.spyOn(productService, 'fetchSaleProducts')
  const fetchRecommendedProducts = vi.spyOn(productService, 'fetchRecommendedProducts')
  const fetchSuggestions = vi.spyOn(productService, 'fetchSuggestions')
  const fetchCategoryCounts = vi.spyOn(productService, 'fetchCategoryCounts')
  if (catalog instanceof Error) {
    for (const spy of [
      fetchProduct,
      fetchProductListing,
      fetchProductsByIds,
      fetchSaleProducts,
      fetchRecommendedProducts,
      fetchSuggestions,
      fetchCategoryCounts,
    ]) {
      spy.mockRejectedValue(catalog)
    }
  } else {
    const api = fakeCatalogApi(catalog)
    fetchProduct.mockImplementation((id) =>
      Promise.resolve(catalog.find((product) => product.id === id) ?? null),
    )
    fetchProductListing.mockImplementation(api.listing)
    fetchProductsByIds.mockImplementation(api.byIds)
    fetchSaleProducts.mockImplementation(api.sale)
    fetchRecommendedProducts.mockImplementation(api.recommended)
    fetchSuggestions.mockImplementation(api.suggestions)
    fetchCategoryCounts.mockImplementation(api.categoryCounts)
    // Parts of the API that are down while the rest answers.
    const down = new Error('down')
    if (failing.includes('categoryCounts')) fetchCategoryCounts.mockRejectedValue(down)
    if (failing.includes('suggestions')) fetchSuggestions.mockRejectedValue(down)
    if (failing.includes('sale')) fetchSaleProducts.mockRejectedValue(down)
    if (failing.includes('recommended')) fetchRecommendedProducts.mockRejectedValue(down)
  }

  return {
    fetchProduct,
    fetchProductListing,
    fetchProductsByIds,
    fetchSaleProducts,
    fetchRecommendedProducts,
    fetchSuggestions,
    fetchCategoryCounts,
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <RouterProbe />
      </MemoryRouter>,
    ),
  }
}
