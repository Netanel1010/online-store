import { useEffect } from 'react'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { useProductCatalog } from '@/features/products/useProductCatalog'

/**
 * The stores keep product ids, and an id can outlive its product (a product removed from the
 * catalog). Once the catalog is loaded, drop unknown ids so badges and pages never count
 * something that cannot be shown. Renders nothing.
 */
export function ShopStateReconciler() {
  const catalog = useProductCatalog()
  const products = catalog.status === 'ready' ? catalog.products : null

  useEffect(() => {
    if (!products) return
    const validIds = new Set(products.map((product) => product.id))
    useCartStore.getState().retainOnly(validIds)
    useFavoritesStore.getState().retainOnly(validIds)
  }, [products])

  return null
}
