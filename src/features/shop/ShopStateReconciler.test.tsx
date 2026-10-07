import { act, render, waitFor } from '@testing-library/react'
import { useCartStore } from '@/features/cart/cartStore'
import { useCartSyncStatus } from '@/features/cart/cartSyncStatus'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import type { Product } from '@/features/products/schema'
import { makeProduct } from '@/test/fixtures'
import * as productService from '@/services/productService'
import { ShopStateReconciler } from './ShopStateReconciler'

const known = (...ids: string[]) => ids.map((id) => makeProduct({ id }))

/** The API knows exactly these products. */
function apiKnows(products: Product[]) {
  return vi
    .spyOn(productService, 'fetchProductsByIds')
    .mockImplementation((ids) =>
      Promise.resolve(products.filter((product) => ids.includes(product.id))),
    )
}

describe('ShopStateReconciler', () => {
  it('drops the ids of the cart and the favorites that the API has no product for', async () => {
    useCartStore.getState().addItem('A')
    useCartStore.getState().addItem('GONE-1')
    useFavoritesStore.getState().toggle('B')
    useFavoritesStore.getState().toggle('GONE-2')
    apiKnows(known('A', 'B'))

    render(<ShopStateReconciler />)

    await waitFor(() =>
      expect(useCartStore.getState().items).toEqual([{ productId: 'A', quantity: 1 }]),
    )
    expect(useFavoritesStore.getState().ids).toEqual(['B'])
  })

  it('asks once, about the ids of both, and asks nothing when there are none', async () => {
    useCartStore.getState().addItem('A')
    useFavoritesStore.getState().toggle('A')
    useFavoritesStore.getState().toggle('B')
    const lookup = apiKnows(known('A', 'B'))

    const { unmount } = render(<ShopStateReconciler />)
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1))
    expect(lookup.mock.calls[0]?.[0]).toEqual(['A', 'B'])
    unmount()

    useCartStore.setState({ items: [] })
    useFavoritesStore.setState({ ids: [] })
    lookup.mockClear()
    render(<ShopStateReconciler />)
    await act(async () => {})
    expect(lookup).not.toHaveBeenCalled()
  })

  it('drops nothing when the API cannot be asked', async () => {
    useCartStore.getState().addItem('A')
    useFavoritesStore.getState().toggle('B')
    const lookup = vi
      .spyOn(productService, 'fetchProductsByIds')
      .mockRejectedValue(new Error('down'))

    render(<ShopStateReconciler />)
    await waitFor(() => expect(lookup).toHaveBeenCalled())
    await act(async () => {})

    expect(useCartStore.getState().items).toHaveLength(1)
    expect(useFavoritesStore.getState().ids).toEqual(['B'])
  })

  it('keeps what the visitor added while the API was answering', async () => {
    useCartStore.getState().addItem('A')
    useCartStore.getState().addItem('GONE-1')
    let answer: (products: Product[]) => void = () => undefined
    vi.spyOn(productService, 'fetchProductsByIds').mockReturnValue(
      new Promise((resolve) => {
        answer = resolve
      }),
    )
    render(<ShopStateReconciler />)

    act(() => {
      useCartStore.getState().addItem('NEW-1') // a product the API was not asked about
      useFavoritesStore.getState().toggle('NEW-2')
    })
    await act(async () => answer(known('A')))

    expect(useCartStore.getState().items.map((item) => item.productId)).toEqual(['A', 'NEW-1'])
    expect(useFavoritesStore.getState().ids).toEqual(['NEW-2'])
  })

  it('waits for the cart of the account, then looks at it too', async () => {
    useCartSyncStatus.setState({ reading: true })
    useCartStore.getState().addItem('A')
    const lookup = apiKnows(known('A'))
    render(<ShopStateReconciler />)
    await act(async () => {})
    expect(lookup).not.toHaveBeenCalled()

    // The account's cart arrives with a line whose product has been removed since.
    act(() => {
      useCartStore.getState().addItem('GONE-1')
      useCartSyncStatus.setState({ reading: false })
    })

    await waitFor(() => expect(lookup).toHaveBeenCalled())
    await waitFor(() =>
      expect(useCartStore.getState().items).toEqual([{ productId: 'A', quantity: 1 }]),
    )
  })
})
