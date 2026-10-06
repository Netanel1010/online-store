import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { Price } from '@/components/shared/Price'
import { assetUrl } from '@/lib/assets'
import { IMAGE_SIZE } from '@/lib/imageSizes'
import { BRANDS } from '../brands'
import type { Product } from '../schema'
import { discountPercent } from '../selectors'

interface ProductCardProps {
  product: Product
  /** Heading level for the product name. Match the page outline (h2 under an h1, h3 under an h2). */
  headingAs?: 'h2' | 'h3'
  /** Slot for per-product controls (add to cart, favorite, ...). Rendered outside the card link. */
  actions?: ReactNode
  /** Load the product image right away. For cards that are visible without scrolling. */
  eager?: boolean
}

/**
 * The only product card in the app. The whole card is clickable through one "stretched" link
 * on the product name, so assistive technology hears a single link per product and `actions`
 * can hold real buttons without nesting interactive elements inside an anchor.
 */
export function ProductCard({
  product,
  headingAs: Heading = 'h3',
  actions,
  eager = false,
}: ProductCardProps) {
  const brand = BRANDS[product.brand]
  const discount = discountPercent(product.price)

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-white transition duration-200 focus-within:border-brand/40 focus-within:shadow-lg motion-safe:hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg">
      <div className="relative aspect-[4/3] p-4 sm:aspect-square">
        {/* Decorative: the product name in the link below already describes it. */}
        <img
          src={assetUrl(product.images.card)}
          alt=""
          {...IMAGE_SIZE.productPicture}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          className="size-full object-contain transition-transform duration-300 motion-safe:group-hover:scale-105"
        />
        {discount !== undefined && (
          <span className="absolute start-3 top-3 rounded-full bg-sale px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
            מבצע
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4 pt-0">
        <img
          src={assetUrl(brand.logo)}
          alt={brand.name}
          {...IMAGE_SIZE.brandLogo}
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
