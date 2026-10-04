import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Price } from '@/components/shared/Price'
import { assetUrl } from '@/lib/assets'
import { BRANDS } from '../brands'
import type { Product } from '../schema'
import { discountPercent } from '../selectors'

interface ProductCardProps {
  product: Product
  /** Heading level for the product name. Match the page outline (h2 under an h1, h3 under an h2). */
  headingAs?: 'h2' | 'h3'
  /** Slot for per-product controls (add to cart, favorite, ...). Rendered outside the card link. */
  actions?: ReactNode
}

/**
 * The only product card in the app. The whole card is clickable through one "stretched" link
 * on the product name, so assistive technology hears a single link per product and `actions`
 * can hold real buttons without nesting interactive elements inside an anchor.
 */
export function ProductCard({ product, headingAs: Heading = 'h3', actions }: ProductCardProps) {
  const brand = BRANDS[product.brand]
  const discount = discountPercent(product.price)

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white transition-shadow focus-within:shadow-md hover:shadow-md">
      <div className="relative aspect-square p-4">
        {/* Decorative: the product name in the link below already describes it. */}
        <img
          src={assetUrl(product.images.card)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
        />
        {discount !== undefined && (
          <span className="absolute start-3 top-3 rounded bg-sale px-2 py-0.5 text-xs font-bold text-white">
            מבצע
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
        <img
          src={assetUrl(brand.logo)}
          alt={brand.name}
          loading="lazy"
          decoding="async"
          className="h-5 w-auto self-start"
        />
        <Heading className="text-base font-semibold leading-snug">
          <Link
            to={paths.product(product.id)}
            className="rounded after:absolute after:inset-0 hover:text-brand"
          >
            {product.name}
          </Link>
        </Heading>
        <p className="text-xs text-muted">
          מק&quot;ט: <span dir="ltr">{product.id}</span>
        </p>
        <div className="mt-auto pt-2">
          <Price price={product.price} />
        </div>
      </div>

      {actions && <div className="relative z-10 border-t border-line p-3">{actions}</div>}
    </article>
  )
}
