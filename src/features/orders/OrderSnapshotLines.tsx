import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { useProductsByIds } from '@/features/products/useProductsByIds'
import { assetUrl } from '@/lib/assets'
import { formatPrice } from '@/lib/format'
import { IMAGE_SIZE } from '@/lib/imageSizes'
import type { OrderLine } from './orderSchema'

/**
 * The lines of an order as they were when it was placed: the name, the quantity and the prices are
 * the order's own. The API is only asked for a picture, and the lines do not wait for it or fail
 * without it; a product that has since been renamed, repriced or removed changes nothing here.
 */
export function OrderSnapshotLines({
  lines,
  label,
}: {
  lines: readonly OrderLine[]
  label: string
}) {
  const products = useProductsByIds(lines.map((line) => line.productId))
  const pictureOf = (productId: string) =>
    products.status === 'ready'
      ? products.products.find((product) => product.id === productId)?.images.card
      : undefined

  return (
    <ul aria-label={label} className="divide-y divide-line border-y border-line">
      {lines.map((line) => {
        const picture = pictureOf(line.productId)
        return (
          <li key={line.productId} className="flex items-center gap-3 py-3">
            {picture && (
              <img
                src={assetUrl(picture)}
                alt=""
                {...IMAGE_SIZE.productPicture}
                loading="lazy"
                decoding="async"
                className="size-14 shrink-0 rounded-lg border border-line bg-white object-contain p-1"
              />
            )}
            <div className="min-w-0 flex-1">
              <Link
                to={paths.product(line.productId)}
                className="line-clamp-2 text-sm font-semibold hover:text-brand"
              >
                {line.name}
              </Link>
              <p className="text-xs text-muted">
                כמות: {line.quantity} · מחיר ליחידה: {formatPrice(line.unitPrice)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-bold">
              <span className="sr-only">סה&quot;כ לשורה: </span>
              {formatPrice(line.unitPrice * line.quantity)}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
