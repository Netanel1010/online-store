import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CartIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/features/notifications/toastContext'
import type { Product } from '@/features/products/schema'
import { MAX_QUANTITY, selectQuantityOf, useCartStore } from './cartStore'

interface AddToCartButtonProps {
  product: Pick<Product, 'id' | 'name'>
  size?: 'md' | 'sm'
  className?: string
}

export function AddToCartButton({ product, size = 'sm', className = '' }: AddToCartButtonProps) {
  const addItem = useCartStore((state) => state.addItem)
  const quantity = useCartStore(selectQuantityOf(product.id))
  const toast = useToast()
  const atLimit = quantity >= MAX_QUANTITY

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Button
        size={size}
        disabled={atLimit}
        aria-label={`הוספה לעגלה: ${product.name}`}
        onClick={() => {
          addItem(product.id)
          toast.show({
            message: `${product.name} נוסף לעגלה (בעגלה: ${Math.min(quantity + 1, MAX_QUANTITY)})`,
            action: <Link to={paths.cart}>לעגלה</Link>,
          })
        }}
      >
        <CartIcon className="size-4" />
        הוספה לעגלה
      </Button>
      {quantity > 0 && (
        <span className="text-center text-xs text-muted">
          {atLimit ? `כמות מקסימלית בעגלה (${quantity})` : `בעגלה: ${quantity}`}
        </span>
      )}
    </div>
  )
}
