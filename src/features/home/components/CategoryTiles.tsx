import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { assetUrl } from '@/lib/assets'
import { CATEGORIES } from '@/features/products/categories'

/** Shortcut tiles for the categories that have artwork. */
export function CategoryTiles() {
  const tiles = CATEGORIES.flatMap(({ id, label, image }) => (image ? [{ id, label, image }] : []))

  return (
    <section aria-labelledby="home-categories-heading" className="mt-12">
      <h2 id="home-categories-heading" className="mb-4 text-2xl font-bold">
        קטגוריות
      </h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <li key={tile.id}>
            <Link
              to={paths.category(tile.id)}
              className="flex h-full flex-col items-center gap-3 rounded-xl border border-line bg-white p-4 text-center transition-shadow hover:shadow-md"
            >
              {/* Decorative: the category name below is the link text. */}
              <img
                src={assetUrl(tile.image)}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-24 w-full object-contain"
              />
              <span className="font-semibold">{tile.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
