import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProductListing } from '@/services/productService'
import { fakeListingApi } from '@/test/fakeListingApi'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const spec = (label: string, value: string) => ({ label, value })
const SOCKET = 'תושבת מעבד'

const amd = makeProduct({
  id: 'AMD-1',
  name: 'AMD Ryzen 7 9700X',
  brand: 'amd',
  category: 'cpu',
  specs: [spec(SOCKET, 'AM5')],
})
const intel = makeProduct({
  id: 'INTEL-1',
  name: 'Intel Core Ultra 7 265',
  brand: 'intel',
  category: 'cpu',
  specs: [spec(SOCKET, 'LGA 1851')],
})
const gpu = makeProduct({ id: 'GPU-1', name: 'Gigabyte RTX', brand: 'gigabyte', category: 'gpu' })
const catalog = [amd, intel, gpu]

const url = () => screen.getByTestId('url').textContent
const names = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '')
    .filter((text) => /^(AMD|Intel|Gigabyte)/.test(text))
const lastRequest = (fetchProductListing: ReturnType<typeof renderApp>['fetchProductListing']) =>
  fetchProductListing.mock.calls.at(-1)![0]

describe('what a listing page asks the API for', () => {
  it('asks for everything on the products page', async () => {
    const { fetchProductListing } = renderApp('/products', catalog)
    await screen.findAllByRole('article')

    expect(fetchProductListing).toHaveBeenCalledTimes(1)
    expect(lastRequest(fetchProductListing)).toEqual({
      category: undefined,
      q: '',
      brands: [],
      specs: new Map(),
      sort: 'default',
    })
  })

  it('asks for the category, brands, specifications and sort of the URL', async () => {
    const { fetchProductListing } = renderApp(
      `/category/cpu?brand=intel&${encodeURIComponent(`s.${SOCKET}`)}=AM5&sort=price-desc`,
      catalog,
    )
    await screen.findByRole('group', { name: 'מותג' })

    expect(lastRequest(fetchProductListing)).toEqual({
      category: 'cpu',
      q: '',
      brands: ['intel'],
      specs: new Map([[SOCKET, ['AM5']]]),
      sort: 'price-desc',
    })
  })

  it('asks for the search text of the URL, and for no category', async () => {
    const { fetchProductListing } = renderApp('/search?q=intel%20265', catalog)
    await screen.findAllByRole('article')

    expect(lastRequest(fetchProductListing)).toMatchObject({
      q: 'intel 265',
      category: undefined,
    })
  })

  it('does not send a search text from a page without a search box', async () => {
    const { fetchProductListing } = renderApp('/category/cpu?q=intel', catalog)
    await screen.findByRole('group', { name: 'מותג' })

    expect(lastRequest(fetchProductListing)).toMatchObject({ q: '', category: 'cpu' })
  })

  it('does not send specification filters from pages that have none', async () => {
    const { fetchProductListing } = renderApp(
      `/products?${encodeURIComponent(`s.${SOCKET}`)}=AM5`,
      catalog,
    )
    await screen.findAllByRole('article')

    expect(lastRequest(fetchProductListing)).toMatchObject({ specs: new Map() })
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('asks again, with the change, when a filter or the sort is changed', async () => {
    const { fetchProductListing } = renderApp('/category/cpu', catalog)
    await userEvent.click(await screen.findByRole('checkbox', { name: /Intel/ }))

    await waitFor(() =>
      expect(lastRequest(fetchProductListing)).toMatchObject({ brands: ['intel'] }),
    )
    expect(url()).toBe('/category/cpu?brand=intel')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'מיון' }), 'price-asc')

    await waitFor(() =>
      expect(lastRequest(fetchProductListing)).toMatchObject({
        brands: ['intel'],
        sort: 'price-asc',
      }),
    )
  })

  it('shows the search results in the order the API gives, without sorting them again', async () => {
    const { fetchProductListing } = renderApp('/search?q=intel', catalog)
    await screen.findAllByRole('article')
    const ordered: ProductListing = {
      products: [gpu, intel, amd],
      total: 3,
      facets: { brands: [], specs: [] },
    }

    fetchProductListing.mockResolvedValue(ordered)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'מיון' }), 'name-desc')

    await waitFor(() =>
      expect(names()).toEqual(['Gigabyte RTX', 'Intel Core Ultra 7 265', 'AMD Ryzen 7 9700X']),
    )
  })

  it('shows the total of the API, which may be more than the products of the page', async () => {
    const { fetchProductListing } = renderApp('/products', catalog)
    await screen.findAllByRole('article')

    fetchProductListing.mockResolvedValue({
      products: [amd],
      total: 31,
      facets: { brands: [], specs: [] },
    })
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'מיון' }), 'price-asc')

    expect(await screen.findByText('31 מוצרים')).toBeInTheDocument()
  })
})

describe('while the API answers', () => {
  it('keeps the previous results and the filter panel, dimmed, until the changed request is answered', async () => {
    const answer = fakeListingApi(catalog)
    const { fetchProductListing } = renderApp('/category/cpu', catalog)
    const checkbox = await screen.findByRole('checkbox', { name: /Intel/ })

    let finish: () => void = () => {}
    fetchProductListing.mockImplementation(
      (request) =>
        new Promise((resolve) => {
          finish = () => resolve(answer(request))
        }),
    )
    await userEvent.click(checkbox)

    // The request is still open: the page shows the answer to the previous one.
    const results = screen.getAllByRole('article')[0]!.closest('[aria-busy]')!
    expect(results).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.queryByText('טוען מוצרים…')).not.toBeInTheDocument()
    // The checkbox that was clicked is still the same element: focus is not lost.
    expect(screen.getByRole('checkbox', { name: /Intel/ })).toBe(checkbox)

    act(() => finish())

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(screen.getByText('מוצר אחד', { selector: 'p[role="status"]' })).toBeInTheDocument()
    expect(results).toHaveAttribute('aria-busy', 'false')
  })

  it('shows an error with a retry when a changed request fails, and recovers', async () => {
    const { fetchProductListing } = renderApp('/category/cpu', catalog)
    const checkbox = await screen.findByRole('checkbox', { name: /Intel/ })

    fetchProductListing.mockRejectedValue(new Error('down'))
    await userEvent.click(checkbox)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('משהו השתבש')

    fetchProductListing.mockImplementation(fakeListingApi(catalog))
    await userEvent.click(within(alert).getByRole('button', { name: 'נסו שוב' }))

    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(names()).toEqual(['Intel Core Ultra 7 265'])
    expect(url()).toBe('/category/cpu?brand=intel')
  })

  it('starts a listing of its own when moving to another category', async () => {
    const { fetchProductListing } = renderApp('/category/cpu', catalog)
    await screen.findAllByRole('article')
    const nav = screen.getByRole('navigation', { name: 'סינון לפי קטגוריה' })

    let finish: () => void = () => {}
    const answer = fakeListingApi(catalog)
    fetchProductListing.mockImplementation(
      (request) =>
        new Promise((resolve) => {
          finish = () => resolve(answer(request))
        }),
    )
    await userEvent.click(within(nav).getByRole('link', { name: /כרטיסי מסך/ }))

    // Not the processors of the other category, with the filters of that one.
    expect(await screen.findAllByText('טוען מוצרים…')).not.toHaveLength(0)
    expect(screen.queryByText('AMD Ryzen 7 9700X')).not.toBeInTheDocument()

    act(() => finish())
    expect(await screen.findByRole('heading', { level: 2, name: 'Gigabyte RTX' })).toBeVisible()
  })
})

describe('without the rest of the catalog', () => {
  it('lists and searches products even when the category counts cannot be loaded', async () => {
    renderApp('/search?q=intel', catalog, { failing: ['categoryCounts'] })

    expect(await screen.findByRole('heading', { level: 2, name: /Intel Core/ })).toBeVisible()
    expect(screen.getByText('מוצר אחד', { selector: 'p[role="status"]' })).toBeInTheDocument()
  })

  it('shows the category links on the products page once their counts are known', async () => {
    renderApp('/products', catalog)

    const nav = await screen.findByRole('navigation', { name: 'סינון לפי קטגוריה' })

    expect(within(nav).getByRole('link', { name: /מעבדים/ })).toHaveTextContent('(2)')
  })
})
