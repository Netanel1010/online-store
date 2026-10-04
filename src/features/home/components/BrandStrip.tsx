import { assetUrl } from '@/lib/assets'
import { BRAND_IDS, BRANDS } from '@/features/products/brands'

/** The brands we sell. Not links yet: there is no brand page to link to. */
export function BrandStrip() {
  return (
    <section aria-labelledby="home-brands-heading" className="mt-12">
      <h2 id="home-brands-heading" className="mb-4 text-2xl font-bold">
        מותגים
      </h2>
      <ul className="flex flex-wrap items-center gap-x-10 gap-y-6 rounded-xl border border-line bg-white px-6 py-6">
        {BRAND_IDS.map((id) => (
          <li key={id}>
            <img
              src={assetUrl(BRANDS[id].logo)}
              alt={BRANDS[id].name}
              loading="lazy"
              decoding="async"
              className="h-10 w-auto"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
