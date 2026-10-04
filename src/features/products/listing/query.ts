import { BRAND_IDS, type BrandId } from '../brands'

/**
 * The state of a product listing (search text, filters, sort) and how it maps to the URL.
 * The URL is the source of truth: components parse it on every render and write changes back
 * with `serializeListingQuery`, so reload, sharing and back/forward all reproduce the same view.
 *
 * URL format (all parts optional). Parsing validates what it can without the catalog: the
 * syntax, brand ids, sort keys and sizes. Whether a specification label and value actually exist
 * is checked against the catalog by `sanitizeSpecFilters` (filtering.ts), so unknown ones never
 * reach the filtering:
 *   ?q=intel                      free-text search
 *   &brand=amd&brand=intel        brand filter, repeated for multiple values
 *   &s.<label>=<value>            specification filter, repeated per value (e.g. s.תושבת מעבד=AM5)
 *   &sort=price-asc               sort order; omitted for the default order
 */

export const SORT_KEYS = ['default', 'price-asc', 'price-desc', 'name-asc', 'name-desc'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export interface ListingQuery {
  q: string
  brands: readonly BrandId[]
  /** Selected values per specification label. A Map avoids prototype keys such as "__proto__". */
  specs: ReadonlyMap<string, readonly string[]>
}

export interface ListingState extends ListingQuery {
  sort: SortKey
}

const SPEC_PREFIX = 's.'
const MAX_QUERY_LENGTH = 100
const MAX_SPEC_VALUES = 60

export const emptyListingState: ListingState = {
  q: '',
  brands: [],
  specs: new Map(),
  sort: 'default',
}

function isSortKey(value: string | null): value is SortKey {
  return value !== null && (SORT_KEYS as readonly string[]).includes(value)
}

const brandIdSet: ReadonlySet<string> = new Set(BRAND_IDS)

export function parseListingState(
  params: URLSearchParams,
  { search = true }: { search?: boolean } = {},
): ListingState {
  const q = search ? (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH) : ''

  const requestedBrands = new Set(params.getAll('brand'))
  const brands = BRAND_IDS.filter((id) => requestedBrands.has(id) && brandIdSet.has(id))

  const specs = new Map<string, string[]>()
  let specValues = 0
  for (const [key, value] of params) {
    if (!key.startsWith(SPEC_PREFIX) || key.length === SPEC_PREFIX.length || value === '') continue
    if (specValues >= MAX_SPEC_VALUES) break
    const label = key.slice(SPEC_PREFIX.length)
    const values = specs.get(label) ?? []
    if (!values.includes(value)) {
      values.push(value)
      specs.set(label, values)
      specValues += 1
    }
  }

  const sort = params.get('sort')
  return { q, brands, specs, sort: isSortKey(sort) ? sort : 'default' }
}

/** Canonical URL parameters: the same state always produces the same string, whatever the click order. */
export function serializeListingState(
  state: ListingState,
  { search = true }: { search?: boolean } = {},
): URLSearchParams {
  const params = new URLSearchParams()
  if (search && state.q !== '') params.set('q', state.q)
  for (const brand of BRAND_IDS) {
    if (state.brands.includes(brand)) params.append('brand', brand)
  }
  const labels = [...state.specs.keys()].sort()
  for (const label of labels) {
    for (const value of [...(state.specs.get(label) ?? [])].sort()) {
      params.append(`${SPEC_PREFIX}${label}`, value)
    }
  }
  if (state.sort !== 'default') params.set('sort', state.sort)
  return params
}

export function toggleBrand(state: ListingState, brand: BrandId): ListingState {
  const brands = state.brands.includes(brand)
    ? state.brands.filter((id) => id !== brand)
    : [...state.brands, brand]
  return { ...state, brands }
}

export function toggleSpecValue(state: ListingState, label: string, value: string): ListingState {
  const specs = new Map(state.specs)
  const current = specs.get(label) ?? []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  if (next.length === 0) specs.delete(label)
  else specs.set(label, next)
  return { ...state, specs }
}

export function setSort(state: ListingState, sort: SortKey): ListingState {
  return { ...state, sort }
}

/** Removes every filter. The search text and the sort order are not filters and are kept. */
export function clearFilters(state: ListingState): ListingState {
  return { ...state, brands: [], specs: new Map() }
}

export function countActiveFilters(state: ListingQuery): number {
  let count = state.brands.length
  for (const values of state.specs.values()) count += values.length
  return count
}
