import { useState } from 'react'
import { CartIcon } from '@/components/icons'
import { Button } from '@/components/ui/Button'
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
  const [announcement, setAnnouncement] = useState('')
  const atLimit = quantity >= MAX_QUANTITY

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <Button
        size={size}
        disabled={atLimit}
        aria-label={`הוספה לעגלה: ${product.name}`}
        onClick={() => {
          addItem(product.id)
          setAnnouncement(
            `${product.name} נוסף לעגלה. כמות בעגלה: ${Math.min(quantity + 1, MAX_QUANTITY)}`,
          )
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
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}
