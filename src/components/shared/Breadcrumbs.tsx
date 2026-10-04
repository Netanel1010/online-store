import { Link } from 'react-router'
import { ChevronEndIcon } from '@/components/icons'

export interface Crumb {
  label: string
  /** Omit for the current page. */
  to?: string
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="פירורי לחם" className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1">
        {items.map((item, index) => (
          <li key={`${index}-${item.label}`} className="flex items-center gap-1">
            {index > 0 && <ChevronEndIcon className="size-4 text-muted/70" />}
            {item.to ? (
              <Link
                to={item.to}
                className="rounded underline-offset-4 hover:text-brand hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
