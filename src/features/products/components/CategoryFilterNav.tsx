import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CATEGORIES, type CategoryId } from '../categories'

interface CategoryFilterNavProps {
  /** The number of products of each category (only the categories that have some). */
  counts: ReadonlyMap<CategoryId, number>
  /** Undefined means "all products". */
  active?: CategoryId
}

function chipClass(isActive: boolean) {
  return `inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
    isActive
      ? 'border-brand bg-brand text-white'
      : 'border-line bg-white text-ink hover:border-brand hover:text-brand'
  }`
}

/** Category links with product counts. Only categories that have products are listed. */
export function CategoryFilterNav({ counts, active }: CategoryFilterNavProps) {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)

  return (
    <nav aria-label="סינון לפי קטגוריה" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            to={paths.products}
            aria-current={active === undefined ? 'page' : undefined}
            className={chipClass(active === undefined)}
          >
            הכל <span className="opacity-80">({total})</span>
          </Link>
        </li>
        {CATEGORIES.filter((category) => counts.has(category.id)).map((category) => (
          <li key={category.id}>
            <Link
              to={paths.category(category.id)}
              aria-current={active === category.id ? 'page' : undefined}
              className={chipClass(active === category.id)}
            >
              {category.label} <span className="opacity-80">({counts.get(category.id)})</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
