import { Link } from 'react-router'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { assetUrl } from '@/lib/assets'
import { IMAGE_SIZE } from '@/lib/imageSizes'
import { BRAND_IDS, BRANDS } from '@/features/products/brands'
import { brandListingPath } from '@/features/products/brandPath'

/**
 * The brands we sell. Each logo is a link to the listing of that brand's products. The link is
 * named by its label ("מוצרי AMD") and the logo inside is decorative (`alt=""`), so a screen
 * reader says the brand once, and says where the link goes.
 */
export function BrandStrip() {
  return (
    <section aria-labelledby="home-brands-heading" className="mt-12">
      <SectionHeading id="home-brands-heading">מותגים</SectionHeading>
      <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 rounded-xl border border-line bg-white px-6 py-8 md:justify-between">
        {BRAND_IDS.map((id) => (
          <li key={id}>
            <Link
              to={brandListingPath(id)}
              aria-label={`מוצרי ${BRANDS[id].name}`}
              className="group block rounded-lg"
            >
              <img
                src={assetUrl(BRANDS[id].logo)}
                alt=""
                {...IMAGE_SIZE.brandLogo}
                loading="lazy"
                decoding="async"
                className="h-10 w-auto opacity-70 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0 group-focus-visible:opacity-100 group-focus-visible:grayscale-0"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
