import { SectionHeading } from '@/components/shared/SectionHeading'
import { assetUrl } from '@/lib/assets'
import { IMAGE_SIZE } from '@/lib/imageSizes'
import { BRAND_IDS, BRANDS } from '@/features/products/brands'

/** The brands we sell. Not links yet: there is no brand page to link to. */
export function BrandStrip() {
  return (
    <section aria-labelledby="home-brands-heading" className="mt-12">
      <SectionHeading id="home-brands-heading">מותגים</SectionHeading>
      <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 rounded-xl border border-line bg-white px-6 py-8 md:justify-between">
        {BRAND_IDS.map((id) => (
          <li key={id}>
            <img
              src={assetUrl(BRANDS[id].logo)}
              alt={BRANDS[id].name}
              {...IMAGE_SIZE.brandLogo}
              loading="lazy"
              decoding="async"
              className="h-10 w-auto opacity-70 grayscale transition duration-300 hover:opacity-100 hover:grayscale-0"
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
