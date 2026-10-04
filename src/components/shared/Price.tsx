import { discountPercent } from '@/features/products/selectors'
import type { Product } from '@/features/products/schema'
import { formatPrice } from '@/lib/format'

interface PriceProps {
  price: Product['price']
  size?: 'md' | 'lg'
}

/** Current price, plus the previous price and discount when the product is on sale. */
export function Price({ price, size = 'md' }: PriceProps) {
  const discount = discountPercent(price)
  const currentClass = size === 'lg' ? 'text-3xl' : 'text-xl'

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={`${currentClass} font-bold ${discount ? 'text-sale' : 'text-ink'}`}>
        <span className="sr-only">מחיר: </span>
        {formatPrice(price.current)}
      </span>
      {price.original !== undefined && (
        <>
          <del className="text-sm text-muted">
            <span className="sr-only">מחיר קודם: </span>
            {formatPrice(price.original)}
          </del>
          <span className="rounded bg-sale-soft px-1.5 py-0.5 text-xs font-semibold text-sale">
            הנחה {discount}%
          </span>
        </>
      )}
    </div>
  )
}
