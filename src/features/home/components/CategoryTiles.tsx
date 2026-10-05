import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { SectionHeading } from '@/components/shared/SectionHeading'
import { assetUrl } from '@/lib/assets'
import { CATEGORIES } from '@/features/products/categories'

/** Shortcut tiles for the categories that have artwork. */
export function CategoryTiles() {
  const tiles = CATEGORIES.flatMap(({ id, label, image }) => (image ? [{ id, label, image }] : []))

  return (
    <section aria-labelledby="home-categories-heading" className="mt-12">
      <SectionHeading id="home-categories-heading">קטגוריות</SectionHeading>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link
              to={paths.category(tile.id)}
              className="group flex h-full flex-col items-center gap-3 rounded-xl border border-line bg-white p-4 text-center transition motion-safe:hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
            >
              {/* Decorative: the category name below is the link text. */}
              <img
                src={assetUrl(tile.image)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-24 w-full object-contain transition-transform duration-300 motion-safe:group-hover:scale-105"
              />
              <span className="font-semibold transition-colors group-hover:text-brand">
                {tile.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
