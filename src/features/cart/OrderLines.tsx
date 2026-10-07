import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { assetUrl } from '@/lib/assets'
import { formatPrice } from '@/lib/format'
import { IMAGE_SIZE } from '@/lib/imageSizes'
import type { CartLine } from './summary'

/** Read-only list of what is about to be ordered, with today's prices (the order page shows `OrderSnapshotLines`). */
export function OrderLines({ lines, label }: { lines: readonly CartLine[]; label: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line border-y border-line">
      {lines.map(({ product, quantity }) => (
        <li key={product.id} className="flex items-center gap-3 py-3">
          <img
            src={assetUrl(product.images.card)}
            alt=""
            {...IMAGE_SIZE.productPicture}
            loading="lazy"
            decoding="async"
            className="size-14 shrink-0 rounded-lg border border-line bg-white object-contain p-1"
          />
          <div className="min-w-0 flex-1">
            <Link
              to={paths.product(product.id)}
              className="line-clamp-2 text-sm font-semibold hover:text-brand"
            >
              {product.name}
            </Link>
            <p className="text-xs text-muted">כמות: {quantity}</p>
          </div>
          <p className="shrink-0 text-sm font-bold">
            <span className="sr-only">סה&quot;כ לשורה: </span>
            {formatPrice(product.price.current * quantity)}
          </p>
        </li>
      ))}
    </ul>
  )
}
