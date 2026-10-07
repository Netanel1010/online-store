import { useEffect } from 'react'
import { useCartStore } from '@/features/cart/cartStore'
import { useCartSyncStatus } from '@/features/cart/cartSyncStatus'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { rememberProducts } from '@/features/products/productCache'
import { fetchProductsByIds } from '@/services/productService'

/**
 * The stores keep product ids, and an id can outlive its product (a product removed from the
 * catalog). When the site opens, and again when the account's cart has arrived (it can hold ids too),
 * the API is asked about the ids in the cart and the favorites, and the ones it has no product for
 * are dropped, so badges and pages never count something that cannot be shown. A product the
 * visitor adds later was just shown by the API, so it is not asked about again. If the API cannot be
 * asked, nothing is dropped. Renders nothing.
 */
export function ShopStateReconciler() {
  // While the account's cart is on its way the cart is not complete yet: look at it once it is.
  const reading = useCartSyncStatus((state) => state.reading)

  useEffect(() => {
    if (reading) return
    const asked = [
      ...new Set([
        ...useCartStore.getState().items.map((item) => item.productId),
        ...useFavoritesStore.getState().ids,
      ]),
    ]
    if (asked.length === 0) return

    const controller = new AbortController()
    fetchProductsByIds(asked, controller.signal).then(
      (products) => {
        rememberProducts(products)
        const found = new Set(products.map((product) => product.id))
        const gone = new Set(asked.filter((id) => !found.has(id)))
        if (gone.size === 0) return
        // Judged on what the stores hold now: what was added while the API answered is kept.
        const stillValid = (id: string) => !gone.has(id)
        useCartStore.getState().retainOnly(
          new Set(
            useCartStore
              .getState()
              .items.map((i) => i.productId)
              .filter(stillValid),
          ),
        )
        useFavoritesStore
          .getState()
          .retainOnly(new Set(useFavoritesStore.getState().ids.filter(stillValid)))
      },
      () => {
        // The API cannot be reached: the ids stay, as they would for any other failure.
      },
    )
    return () => controller.abort()
  }, [reading])

  return null
}
