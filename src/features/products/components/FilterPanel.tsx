import { Button } from '@/components/ui/Button'
import type { Facet } from '../listing/filtering'

interface FilterPanelProps {
  facets: readonly Facet[]
  activeCount: number
  onToggle: (facet: Facet, value: string) => void
  onClear: () => void
}

/** One fieldset per filter group. Options that would return nothing are disabled, not hidden. */
export function FilterPanel({ facets, activeCount, onToggle, onClear }: FilterPanelProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">סינון</h2>
        {activeCount > 0 && (
          <Button variant="secondary" size="sm" onClick={onClear}>
            ניקוי סינון
          </Button>
        )}
      </div>

      {facets.map((facet) => (
        <fieldset key={facet.id} className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">{facet.title}</legend>
          <ul className="space-y-1">
            {facet.options.map((option) => {
              const unavailable = option.count === 0 && !option.selected
              return (
                <li key={option.value}>
                  <label
                    className={`flex min-h-9 items-start gap-2 rounded-md px-1 py-1 text-sm ${
                      unavailable ? 'text-muted/60' : 'cursor-pointer hover:bg-surface'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={option.selected}
                      disabled={unavailable}
                      onChange={() => onToggle(facet, option.value)}
                      className="mt-0.5 size-4 shrink-0 accent-brand"
                    />
                    <span className="flex-1 break-words">
                      <bdi>{option.label}</bdi>
                    </span>
                    <span className="text-xs text-muted">({option.count})</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  )
}
