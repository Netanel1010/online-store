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

describe('FavoritesPage: cart connection and layout', () => {
  const cartItems = () => useCartStore.getState().items

  it('adds every favorite to the cart with one button and tells how many were added', async () => {
    useFavoritesStore.getState().toggle('PSU-1')
    useFavoritesStore.getState().toggle('GPU-1')
    renderApp('/favorites', catalog)

    await userEvent.click(await screen.findByRole('button', { name: 'הוספת הכול לעגלה' }))

    expect(cartItems()).toEqual([
      { productId: 'PSU-1', quantity: 1 },
      { productId: 'GPU-1', quantity: 1 },
    ])
    expect(await screen.findByText('2 מוצרים נוספו לעגלה')).toBeInTheDocument()
    expect(useFavoritesStore.getState().ids).toEqual(['PSU-1', 'GPU-1'])
  })

  it('only adds the favorites that are not in the cart yet, and keeps their quantities', async () => {
    useCartStore.getState().addItem('PSU-1', 3)
    useFavoritesStore.getState().toggle('PSU-1')
    useFavoritesStore.getState().toggle('GPU-1')
    renderApp('/favorites', catalog)

    await userEvent.click(await screen.findByRole('button', { name: 'הוספת השאר לעגלה (1)' }))

    expect(cartItems()).toEqual([
      { productId: 'PSU-1', quantity: 3 },
      { productId: 'GPU-1', quantity: 1 },
    ])
    expect(await screen.findByText('מוצר אחד נוסף לעגלה')).toBeInTheDocument()
  })

  it('offers the cart instead once everything is already in it', async () => {
    useCartStore.getState().addItem('PSU-1')
    useFavoritesStore.getState().toggle('PSU-1')
    renderApp('/favorites', catalog)

    expect(await screen.findByRole('link', { name: /הכול כבר בעגלה/ })).toHaveAttribute(
      'href',
      '/cart',
    )
    expect(screen.queryByRole('button', { name: /הוספת הכול|הוספת השאר/ })).not.toBeInTheDocument()
  })

  it('keeps the remove control a named button, with the filled heart as its icon', async () => {
    useFavoritesStore.getState().toggle('PSU-1')
    renderApp('/favorites', catalog)

    const remove = await screen.findByRole('button', { name: 'הסרת ספק כוח מהמועדפים' })

    expect(remove).toHaveTextContent('')
    expect(remove.querySelector('svg')).not.toBeNull()
  })

  it('suggests the recommended products when there are no favorites', async () => {
    const recommended = makeProduct({ id: 'REC-1', name: 'מוצר מומלץ', isRecommended: true })
    renderApp('/favorites', [psu, recommended])

    expect(await screen.findByText('אין מוצרים במועדפים')).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'מומלצים' })
    expect(within(section).getByRole('link', { name: 'מוצר מומלץ' })).toBeInTheDocument()
  })

  it('shows no suggestions when nothing is recommended, and none next to real favorites', async () => {
    renderApp('/favorites', catalog)
    expect(await screen.findByText('אין מוצרים במועדפים')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'מומלצים' })).not.toBeInTheDocument()
  })

  it('does not suggest anything while there are favorites', async () => {
    const recommended = makeProduct({ id: 'REC-1', name: 'מוצר מומלץ', isRecommended: true })
    useFavoritesStore.getState().toggle('PSU-1')
    renderApp('/favorites', [psu, recommended])

    await screen.findAllByRole('article')
    expect(screen.queryByRole('region', { name: 'מומלצים' })).not.toBeInTheDocument()
  })
})
