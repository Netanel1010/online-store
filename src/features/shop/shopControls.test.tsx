import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'
import { AddToCartButton } from '@/features/cart/AddToCartButton'
import { MAX_QUANTITY, useCartStore } from '@/features/cart/cartStore'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'

const product = makeProduct({ id: 'GP-1', name: 'ספק כוח' })

describe('AddToCartButton', () => {
  it('adds the product, shows the quantity and announces it', async () => {
    render(<AddToCartButton product={product} />)
    const button = screen.getByRole('button', { name: 'הוספה לעגלה: ספק כוח' })
    expect(screen.queryByText(/בעגלה:/)).not.toBeInTheDocument()

    await userEvent.click(button)
    expect(useCartStore.getState().items).toEqual([{ productId: 'GP-1', quantity: 1 }])
    expect(screen.getByText('בעגלה: 1')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('ספק כוח נוסף לעגלה. כמות בעגלה: 1')

    await userEvent.click(button)
    expect(useCartStore.getState().items).toEqual([{ productId: 'GP-1', quantity: 2 }])
    expect(screen.getByRole('status')).toHaveTextContent('כמות בעגלה: 2')
  })

  it('reflects what is already in the cart', () => {
    useCartStore.getState().addItem('GP-1', 3)
    render(<AddToCartButton product={product} />)

    expect(screen.getByText('בעגלה: 3')).toBeInTheDocument()
  })

  it('is disabled once the maximum quantity is reached', () => {
    useCartStore.getState().addItem('GP-1', MAX_QUANTITY)
    render(<AddToCartButton product={product} />)

    expect(screen.getByRole('button', { name: /הוספה לעגלה/ })).toBeDisabled()
    expect(screen.getByText(/כמות מקסימלית/)).toBeInTheDocument()
  })
})

describe('FavoriteButton', () => {
  it('toggles the favorite and exposes the state through aria-pressed', async () => {
    render(<FavoriteButton product={product} />)
    const button = screen.getByRole('button', { name: 'מועדפים: ספק כוח' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(useFavoritesStore.getState().ids).toEqual(['GP-1'])

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(useFavoritesStore.getState().ids).toEqual([])
  })

  it('can show a visible label', () => {
    render(<FavoriteButton product={product} showLabel />)

    expect(screen.getByRole('button', { name: 'מועדפים: ספק כוח' })).toHaveTextContent('מועדפים')
  })
})

describe('controls in the app', () => {
  const other = makeProduct({ id: 'OTHER', name: 'מוצר אחר' })

  it('gives every product card an add-to-cart and a favorite control', async () => {
    renderApp('/products', [product, other])

    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(within(card).getByRole('button', { name: /הוספה לעגלה/ })).toBeInTheDocument()
      expect(within(card).getByRole('button', { name: /מועדפים/ })).toBeInTheDocument()
      // Controls are real buttons outside of the card's single link.
      expect(within(card).getAllByRole('link')).toHaveLength(1)
    }

    await userEvent.click(within(cards[1]!).getByRole('button', { name: /הוספה לעגלה/ }))
    expect(useCartStore.getState().items).toEqual([{ productId: 'OTHER', quantity: 1 }])
  })

  it('has the same controls on the product page', async () => {
    renderApp('/products/GP-1', [product])

    await userEvent.click(await screen.findByRole('button', { name: 'הוספה לעגלה: ספק כוח' }))
    await userEvent.click(screen.getByRole('button', { name: 'מועדפים: ספק כוח' }))

    expect(useCartStore.getState().items).toEqual([{ productId: 'GP-1', quantity: 1 }])
    expect(useFavoritesStore.getState().ids).toEqual(['GP-1'])
  })

  it('drops cart and favorite ids that are not in the catalog once it has loaded', async () => {
    useCartStore.getState().addItem('GP-1')
    useCartStore.getState().addItem('REMOVED-FROM-CATALOG', 2)
    useFavoritesStore.getState().toggle('REMOVED-FROM-CATALOG')
    useFavoritesStore.getState().toggle('GP-1')

    renderApp('/products', [product])

    await waitFor(() => {
      expect(useCartStore.getState().items).toEqual([{ productId: 'GP-1', quantity: 1 }])
      expect(useFavoritesStore.getState().ids).toEqual(['GP-1'])
    })
  })

  it('keeps stored ids when the catalog cannot be loaded', async () => {
    useCartStore.getState().addItem('GP-1')

    renderApp('/products', new Error('down'))
    await screen.findByRole('alert')

    expect(useCartStore.getState().items).toEqual([{ productId: 'GP-1', quantity: 1 }])
  })
})
