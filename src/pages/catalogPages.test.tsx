import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProduct } from '@/test/fixtures'
import { fakeListingApi } from '@/test/fakeListingApi'
import { renderApp } from '@/test/renderApp'

const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס מסך אחד', category: 'gpu' })
const cpu1 = makeProduct({ id: 'CPU-1', name: 'מעבד אחד', category: 'cpu', brand: 'intel' })
const cpu2 = makeProduct({
  id: 'CPU-2',
  name: 'מעבד שני',
  category: 'cpu',
  brand: 'amd',
  price: { current: 750, original: 1000 },
})
const catalog = [gpu, cpu1, cpu2]

describe('ProductsPage', () => {
  it('shows a loading status and then every product', async () => {
    renderApp('/products', catalog)

    expect(screen.getByText('טוען מוצרים…')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'מעבד אחד' })).toBeInTheDocument()
    expect(screen.queryByText('טוען מוצרים…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'כל המוצרים' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(3)
    expect(screen.getByText('3 מוצרים')).toBeInTheDocument()
  })

  it('lists only categories that have products, with counts, and marks "all" as current', async () => {
    renderApp('/products', catalog)
    const nav = await screen.findByRole('navigation', { name: 'סינון לפי קטגוריה' })

    expect(within(nav).getByRole('link', { name: /הכל/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /מעבדים/ })).toHaveTextContent('(2)')
    expect(within(nav).getByRole('link', { name: /כרטיסי מסך/ })).toHaveTextContent('(1)')
    expect(within(nav).queryByRole('link', { name: /אוזניות/ })).not.toBeInTheDocument()
  })

  it('shows an error with a retry that recovers', async () => {
    const { fetchProductListing } = renderApp('/products', new Error('down'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('משהו השתבש')

    fetchProductListing.mockImplementation(fakeListingApi(catalog))
    await userEvent.click(within(alert).getByRole('button', { name: 'נסו שוב' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'מעבד אחד' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('CategoryPage', () => {
  it('shows only the products of that category', async () => {
    renderApp('/category/cpu', catalog)

    expect(await screen.findByRole('heading', { level: 1, name: 'מעבדים' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2))
    expect(screen.queryByText('כרטיס מסך אחד')).not.toBeInTheDocument()
    const filter = screen.getByRole('navigation', { name: 'סינון לפי קטגוריה' })
    expect(within(filter).getByRole('link', { name: /מעבדים/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows the breadcrumb trail', async () => {
    renderApp('/category/gpu', catalog)
    const trail = await screen.findByRole('navigation', { name: 'פירורי לחם' })

    expect(within(trail).getByRole('link', { name: 'מוצרים' })).toHaveAttribute('href', '/products')
    expect(within(trail).getByText('כרטיסי מסך')).toHaveAttribute('aria-current', 'page')
  })

  it('shows an empty state for a valid category without products', async () => {
    renderApp('/category/headset', catalog)

    expect(await screen.findByText('אין מוצרים להצגה')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
  })

  it('shows the not-found page for an unknown category', () => {
    renderApp('/category/laptop', catalog)

    expect(screen.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeInTheDocument()
  })
})
