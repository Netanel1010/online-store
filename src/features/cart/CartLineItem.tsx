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
    // A grid, so on a phone the controls and the total get the whole width under the picture and the
    // name, and from the sm breakpoint they line up under the name.
    <li className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 py-5">
      <Link
        to={paths.product(product.id)}
        // A second link to the same page whose only content is a decorative image: it has no
        // accessible name, so it is kept out of the tab order and the accessibility tree. The
        // product name link below is the link for keyboards and screen readers.
        aria-hidden="true"
        tabIndex={-1}
        className="h-fit shrink-0 rounded-lg border border-line bg-white p-2 sm:row-span-2"
      >
        {/* Decorative: the product name next to it is the link that matters. */}
        <img
          src={assetUrl(product.images.card)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-16 object-contain sm:size-24"
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
      </div>

      {/* What to change on one side, what it comes to on the other: the total of the line sits
          right next to the quantity that makes it. */}
      <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:col-span-1 sm:col-start-2">
        <div className="flex flex-wrap items-center gap-2">
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
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-sale-soft hover:text-sale"
          >
            <TrashIcon className="size-4" />
            הסרה
          </button>
        </div>

        <p className="text-lg font-bold">
          <span className="sr-only">סה&quot;כ לשורה: </span>
          {formatPrice(product.price.current * quantity)}
        </p>
      </div>
    </li>
  )
}
