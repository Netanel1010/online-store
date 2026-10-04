import { CloseIcon } from '@/components/icons'
import { BRANDS } from '../brands'
import type { ListingQuery } from '../listing/query'

interface ActiveFiltersProps {
  query: ListingQuery
  onRemoveBrand: (brand: ListingQuery['brands'][number]) => void
  onRemoveSpec: (label: string, value: string) => void
  onClear: () => void
}

/** The selected filters as removable chips, built from the URL state (so shared URLs show them). */
export function ActiveFilters({ query, onRemoveBrand, onRemoveSpec, onClear }: ActiveFiltersProps) {
  const chips = [
    ...query.brands.map((brand) => ({
      key: `brand-${brand}`,
      text: `מותג: ${BRANDS[brand].name}`,
      remove: () => onRemoveBrand(brand),
    })),
    ...[...query.specs].flatMap(([label, values]) =>
      values.map((value) => ({
        key: `spec-${label}-${value}`,
        text: `${label}: ${value}`,
        remove: () => onRemoveSpec(label, value),
      })),
    ),
  ]
  if (chips.length === 0) return null

  return (
    <ul aria-label="מסננים פעילים" className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={chip.remove}
            aria-label={`הסרת מסנן ${chip.text}`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 text-sm text-brand hover:bg-white"
          >
            <bdi>{chip.text}</bdi>
            <CloseIcon className="size-4" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClear}
          className="min-h-9 rounded-full px-3 text-sm text-muted underline-offset-4 hover:text-brand hover:underline"
        >
          ניקוי הכל
        </button>
      </li>
    </ul>
  )
}
