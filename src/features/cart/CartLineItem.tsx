import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { TrashIcon } from '@/components/icons'
import { Price } from '@/components/shared/Price'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { assetUrl } from '@/lib/assets'
import { formatPrice } from '@/lib/format'
import { MAX_QUANTITY, useCartStore } from './cartStore'
import type { CartLine } from './summary'

interface CartLineItemProps {
  line: CartLine
  onRemove: (productId: string) => void
}

export function CartLineItem({ line, onRemove }: CartLineItemProps) {
  const { product, quantity } = line
  const setQuantity = useCartStore((state) => state.setQuantity)

  return (
    <li className="flex flex-wrap items-start gap-4 py-5 sm:flex-nowrap">
      <Link
        to={paths.product(product.id)}
        // A second link to the same page whose only content is a decorative image: it has no
        // accessible name, so it is kept out of the tab order and the accessibility tree. The
        // product name link below is the link for keyboards and screen readers.
        aria-hidden="true"
        tabIndex={-1}
        className="shrink-0 rounded-lg border border-line bg-white p-2"
      >
        {/* Decorative: the product name next to it is the link that matters. */}
        <img
          src={assetUrl(product.images.card)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-20 object-contain sm:size-24"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold leading-snug">
          <Link to={paths.product(product.id)} className="rounded hover:text-brand">
            {product.name}
          </Link>
        </h2>
        <p className="mt-1 text-xs text-muted">
          מק&quot;ט: <span dir="ltr">{product.id}</span>
        </p>
        <div className="mt-2">
          <Price price={product.price} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <QuantityStepper
            value={quantity}
            max={MAX_QUANTITY}
            label={product.name}
            onChange={(next) => setQuantity(product.id, next)}
          />
          <button
            type="button"
            aria-label={`הסרת ${product.name} מהעגלה`}
            onClick={() => onRemove(product.id)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:bg-surface hover:text-sale"
          >
            <TrashIcon className="size-4" />
            הסרה
          </button>
        </div>
      </div>

      <p className="w-full text-end text-lg font-bold sm:w-auto sm:min-w-24">
        <span className="sr-only">סה&quot;כ לשורה: </span>
        {formatPrice(product.price.current * quantity)}
      </p>
    </li>
  )
}
