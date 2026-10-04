import { Price } from '@/components/shared/Price'
import { ExternalLinkIcon } from '@/components/icons'
import { assetUrl } from '@/lib/assets'
import { formatPrice } from '@/lib/format'
import { BRANDS } from '../brands'
import type { Product } from '../schema'
import { ProductGallery } from './ProductGallery'

/** Product page content. Cart and favorite controls will go in the `actions` slot later. */
export function ProductDetails({ product }: { product: Product }) {
  const brand = BRANDS[product.brand]

  return (
    <article>
      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery
          key={product.id}
          images={product.images.gallery}
          productName={product.name}
        />

        <div className="flex flex-col gap-4">
          <img src={assetUrl(brand.logo)} alt={brand.name} className="h-8 w-auto self-start" />
          <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{product.fullName}</h1>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            <div className="flex gap-1">
              <dt>מק&quot;ט:</dt>
              <dd dir="ltr">{product.id}</dd>
            </div>
            <div className="flex gap-1">
              <dt>אחריות:</dt>
              <dd>{product.warranty}</dd>
            </div>
          </dl>

          <div className="rounded-xl border border-line bg-surface p-4">
            <Price price={product.price} size="lg" />
            {product.price.eilat !== undefined && (
              <p className="mt-2 text-sm text-muted">
                מחיר באילת:{' '}
                <span className="font-semibold text-ink">{formatPrice(product.price.eilat)}</span>
              </p>
            )}
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
        </div>
      </div>

      {product.features.length > 0 && (
        <section aria-labelledby="features-heading" className="mt-12">
          <h2 id="features-heading" className="mb-4 text-xl font-bold">
            תכונות עיקריות
          </h2>
          <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {product.features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                {feature}
              </li>
            ))}
          </ul>
        </section>
      )}

      {product.specs.length > 0 && (
        <section aria-labelledby="specs-heading" className="mt-12">
          <h2 id="specs-heading" className="mb-4 text-xl font-bold">
            מפרט
          </h2>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-start text-sm">
              <caption className="sr-only">מפרט טכני של {product.name}</caption>
              <tbody>
                {product.specs.map((spec) => (
                  <tr
                    key={spec.label}
                    className="border-b border-line last:border-b-0 even:bg-surface"
                  >
                    <th scope="row" className="w-2/5 px-4 py-3 text-start font-medium text-muted">
                      {spec.label}
                    </th>
                    <td className="px-4 py-3">{spec.value}</td>
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
