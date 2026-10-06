import { Price } from '@/components/shared/Price'
import { ExternalLinkIcon } from '@/components/icons'
import { AddToCartButton } from '@/features/cart/AddToCartButton'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { assetUrl } from '@/lib/assets'
import { IMAGE_SIZE } from '@/lib/imageSizes'
import { formatPrice } from '@/lib/format'
import { BRANDS } from '../brands'
import type { Product } from '../schema'
import { ProductGallery } from './ProductGallery'

/** Product page content. */
export function ProductDetails({ product }: { product: Product }) {
  const brand = BRANDS[product.brand]
  const { original } = product.price
  const saving = original === undefined ? undefined : original - product.price.current

  return (
    <article>
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        <ProductGallery
          key={product.id}
          images={product.images.gallery}
          productName={product.name}
        />

        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3">
            <img
              src={assetUrl(brand.logo)}
              alt={brand.name}
              {...IMAGE_SIZE.brandLogo}
              className="h-8 w-auto self-start"
            />
            <h1 className="text-2xl font-bold leading-snug text-balance sm:text-3xl">
              {product.fullName}
            </h1>

            <dl className="flex flex-wrap gap-2 text-sm text-muted">
              <div className="flex gap-1.5 rounded-full bg-surface px-3 py-1">
                <dt>מק&quot;ט:</dt>
                <dd dir="ltr" className="font-medium text-ink">
                  {product.id}
                </dd>
              </div>
              <div className="flex gap-1.5 rounded-full bg-surface px-3 py-1">
                <dt>אחריות:</dt>
                <dd className="font-medium text-ink">{product.warranty}</dd>
              </div>
            </dl>
          </div>

          {/* The price and the way to buy it together, so the decision is in one place. */}
          <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
            <Price price={product.price} size="lg" />
            {saving !== undefined && (
              <p className="mt-2 text-sm font-semibold text-sale">
                חיסכון של {formatPrice(saving)}
              </p>
            )}
            {product.price.eilat !== undefined && (
              <p className="mt-2 text-sm text-muted">
                מחיר באילת:{' '}
                <span className="font-semibold text-ink">{formatPrice(product.price.eilat)}</span>
              </p>
            )}

            <div className="mt-5 flex items-start gap-3">
              <AddToCartButton product={product} size="md" className="flex-1" />
              <FavoriteButton product={product} showLabel />
            </div>
          </div>

          <a
            href={product.manufacturerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start rounded text-sm text-brand underline-offset-4 hover:underline"
          >
            לאתר היצרן
            <ExternalLinkIcon />
            <span className="sr-only">(נפתח בלשונית חדשה)</span>
          </a>

          {product.features.length > 0 && (
            <section aria-labelledby="features-heading" className="border-t border-line pt-5">
              <h2 id="features-heading" className="mb-3 text-lg font-bold">
                תכונות עיקריות
              </h2>
              <ul className="space-y-2 text-sm leading-relaxed sm:text-base">
                {product.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {product.specs.length > 0 && (
        <section aria-labelledby="specs-heading" className="mt-12">
          <h2 id="specs-heading" className="mb-4 text-xl font-bold">
            מפרט
          </h2>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <table className="w-full text-start text-sm">
              <caption className="sr-only">מפרט טכני של {product.name}</caption>
              <tbody>
                {product.specs.map((spec) => (
                  <tr
                    key={spec.label}
                    className="border-b border-line last:border-b-0 even:bg-surface"
                  >
                    <th
                      scope="row"
                      className="w-2/5 px-4 py-3 text-start align-top font-medium text-muted sm:w-1/3"
                    >
                      {spec.label}
                    </th>
                    <td className="px-4 py-3 align-top leading-relaxed break-words">
                      {spec.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </article>
  )
}
