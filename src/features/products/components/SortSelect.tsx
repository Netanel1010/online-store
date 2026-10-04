import { useId } from 'react'
import { SORT_KEYS, type SortKey } from '../listing/query'

const LABELS: Record<SortKey, string> = {
  default: 'ברירת מחדל',
  'price-asc': 'מחיר: מהנמוך לגבוה',
  'price-desc': 'מחיר: מהגבוה לנמוך',
  'name-asc': 'שם: A עד Z',
  'name-desc': 'שם: Z עד A',
}

export function SortSelect({
  value,
  onChange,
}: {
  value: SortKey
  onChange: (sort: SortKey) => void
}) {
  const id = useId()

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="text-muted">
        מיון
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as SortKey)}
        className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm"
      >
        {SORT_KEYS.map((key) => (
          <option key={key} value={key}>
            {LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  )
}
