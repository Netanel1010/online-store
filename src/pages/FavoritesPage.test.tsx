import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCartStore } from '@/features/cart/cartStore'
import { favoriteProducts } from '@/features/favorites/favoriteProducts'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח' })
const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס מסך' })
const catalog = [psu, gpu]

describe('favoriteProducts', () => {
  it('keeps the order favorites were added in and skips unknown ids', () => {
    expect(favoriteProducts(['GPU-1', 'GONE', 'PSU-1'], catalog)).toEqual([gpu, psu])
  })
})

describe('FavoritesPage', () => {
  it('shows a loading state and then the empty state when there are no favorites', async () => {
    renderApp('/favorites', catalog)

    expect(screen.getByText('טוען מוצרים…')).toBeInTheDocument()
    expect(await screen.findByText('אין מוצרים במועדפים')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
  })

  it('lists the favorite products in the order they were added', async () => {
    useFavoritesStore.getState().toggle('GPU-1')
    useFavoritesStore.getState().toggle('PSU-1')
    renderApp('/favorites', catalog)

    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]!).getByRole('link', { name: 'כרטיס מסך' })).toHaveAttribute(
      'href',
      '/products/GPU-1',
    )
    expect(within(cards[1]!).getByRole('link', { name: 'ספק כוח' })).toBeInTheDocument()
    expect(screen.getByText('2 מוצרים')).toBeInTheDocument()
  })

  it('adds a favorite to the cart', async () => {
    useFavoritesStore.getState().toggle('PSU-1')
    renderApp('/favorites', catalog)

    await userEvent.click(await screen.findByRole('button', { name: 'הוספה לעגלה: ספק כוח' }))

    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 1 }])
    expect(useFavoritesStore.getState().ids).toEqual(['PSU-1'])
  })

  it('removes a favorite, announces it and moves focus to the heading', async () => {
    useFavoritesStore.getState().toggle('PSU-1')
    useFavoritesStore.getState().toggle('GPU-1')
    renderApp('/favorites', catalog)

    await userEvent.click(await screen.findByRole('button', { name: 'הסרת ספק כוח מהמועדפים' }))

    expect(useFavoritesStore.getState().ids).toEqual(['GPU-1'])
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('ספק כוח הוסר מהמועדפים')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'מועדפים' })).toHaveFocus()
  })

  it('shows the empty state after the last favorite is removed', async () => {
    useFavoritesStore.getState().toggle('PSU-1')
    renderApp('/favorites', catalog)

    await userEvent.click(await screen.findByRole('button', { name: 'הסרת ספק כוח מהמועדפים' }))

    expect(screen.getByText('אין מוצרים במועדפים')).toBeInTheDocument()
  })

  it('shows an error with retry when the catalog cannot be loaded', async () => {
    renderApp('/favorites', new Error('down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
  })
})

describe('header favorites badge', () => {
  it('shows the number of favorites with an accessible label', async () => {
    useFavoritesStore.getState().toggle('PSU-1')
    useFavoritesStore.getState().toggle('GPU-1')
    renderApp('/products', catalog)

    const link = await screen.findByRole('link', { name: 'מועדפים, 2 פריטים' })
    expect(link).toHaveAttribute('href', '/favorites')
    expect(link).toHaveTextContent('2')
  })

  it('has no badge without favorites and updates live from a product card', async () => {
    renderApp('/products', catalog)

    const link = await screen.findByRole('link', { name: 'מועדפים' })
    expect(link).toHaveTextContent('')

    const [firstCard] = screen.getAllByRole('article')
    await userEvent.click(within(firstCard!).getByRole('button', { name: /^מועדפים:/ }))

    expect(screen.getByRole('link', { name: 'מועדפים, 1 פריטים' })).toHaveTextContent('1')
  })
})
