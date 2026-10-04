import { BRANDS, type BrandId } from '../brands'
import { findCategory } from '../categories'
import type { Product } from '../schema'
import type { ListingQuery, ListingState, SortKey } from './query'

/* ---------------------------------------------------------------------------------------------
 * Filter semantics
 *
 *  - Search: every whitespace-separated word must appear (case-insensitively) in the product's
 *    name, full name, SKU, brand name or category name (AND across words).
 *  - Within one filter group (brand, or one specification label) selected values are OR-ed:
 *    a product has a single value per group, so "AMD or Intel" is the useful meaning.
 *  - Across groups everything is AND-ed: brand AND each specification group AND search.
 *  - A product without a selected specification label does not match that group.
 * ------------------------------------------------------------------------------------------- */

export type GroupKey = { kind: 'brand' } | { kind: 'spec'; label: string }

export function normalizeText(text: string): string {
  return text.toLocaleLowerCase('he').normalize('NFKC')
}

export function matchesSearch(product: Product, q: string): boolean {
  const words = normalizeText(q).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = normalizeText(
    [
      product.name,
      product.fullName,
      product.id,
      BRANDS[product.brand].name,
      findCategory(product.category)?.label ?? '',
    ].join(' '),
  )
  return words.every((word) => haystack.includes(word))
}

function matchesBrandGroup(product: Product, brands: readonly BrandId[]) {
  return brands.length === 0 || brands.includes(product.brand)
}

function matchesSpecGroup(product: Product, label: string, values: readonly string[]) {
  if (values.length === 0) return true
  return product.specs.some((spec) => spec.label === label && values.includes(spec.value))
}

/** Whether a product passes every filter group, optionally ignoring one group (for facet counts). */
function passesGroups(product: Product, query: ListingQuery, skip?: GroupKey) {
  if (!(skip?.kind === 'brand') && !matchesBrandGroup(product, query.brands)) return false
  for (const [label, values] of query.specs) {
    if (skip?.kind === 'spec' && skip.label === label) continue
    if (!matchesSpecGroup(product, label, values)) return false
  }
  return true
}

export function filterProducts(products: readonly Product[], query: ListingQuery): Product[] {
  return products.filter(
    (product) => matchesSearch(product, query.q) && passesGroups(product, query),
  )
}

export function sortProducts(products: readonly Product[], sort: SortKey): Product[] {
  const list = [...products]
  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name, 'he', { numeric: true })
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => a.price.current - b.price.current || byName(a, b))
    case 'price-desc':
      return list.sort((a, b) => b.price.current - a.price.current || byName(a, b))
    case 'name-asc':
      return list.sort((a, b) => byName(a, b) || a.id.localeCompare(b.id))
    case 'name-desc':
      return list.sort((a, b) => byName(b, a) || a.id.localeCompare(b.id))
    default:
      return list
  }
}

/* ---------------------------------------------------------------------------------------------
 * Facets (the filter options shown to the visitor), derived from the products in scope.
 * ------------------------------------------------------------------------------------------- */

export interface FacetOption {
  value: string
  label: string
  /** Products that would match if this option were selected, given the other groups' selections. */
  count: number
  selected: boolean
}

export interface Facet {
  key: GroupKey
  /** Stable id for React keys and form ids. */
  id: string
  title: string
  options: FacetOption[]
}

/**
 * A specification label becomes a filter only when filtering by it is actually useful for the
 * products in scope. Values are free text, so a label where one value is shared by everyone (PCIe
 * version) offers no choice, and one where every value is different across many products (clock
 * speeds) or is a long description would give a useless filter.
 *
 * The heuristic is a trade-off: in very small categories it can still offer a marginal filter
 * (every product necessarily has its own value), because there the alternative is hiding useful
 * ones such as refresh rate or panel type. A curated list per category would be exact but would
 * be hard-coded data, which the filters are meant to avoid.
 */
export const SPEC_FACET_RULES = {
  /** At least this many products must have the label. */
  minProducts: 2,
  /** Between these many different values. */
  minValues: 2,
  maxValues: 10,
  /** Long values are descriptions, not choices. */
  maxValueLength: 40,
  /**
   * From this many products with the label upwards, at most `maxDistinctRatio` of them may have a
   * value of their own (otherwise the values hardly repeat and ticking one is almost never useful).
   * With fewer products the ratio says nothing, so it is not applied.
   */
  ratioMinProducts: 6,
  maxDistinctRatio: 0.75,
} as const

function deriveSpecGroups(products: readonly Product[]) {
  const byLabel = new Map<string, Map<string, number>>()
  const productsPerLabel = new Map<string, number>()
  for (const product of products) {
    for (const { label, value } of product.specs) {
      const values = byLabel.get(label) ?? new Map<string, number>()
      values.set(value, (values.get(value) ?? 0) + 1)
      byLabel.set(label, values)
      productsPerLabel.set(label, (productsPerLabel.get(label) ?? 0) + 1)
    }
  }

  const rules = SPEC_FACET_RULES
  return [...byLabel]
    .filter(([label, values]) => {
      const withLabel = productsPerLabel.get(label) ?? 0
      return (
        withLabel >= rules.minProducts &&
        values.size >= rules.minValues &&
        values.size <= rules.maxValues &&
        (withLabel < rules.ratioMinProducts || values.size / withLabel <= rules.maxDistinctRatio) &&
        [...values.keys()].every((value) => value.length <= rules.maxValueLength)
      )
    })
    .map(([label, values]) => ({ label, values: [...values.keys()] }))
}

const collator = new Intl.Collator('he', { numeric: true })

/**
 * Builds the filter groups for a listing.
 *
 * `scope` is the set the visitor is browsing (a category, or the whole catalog). Which options
 * exist is decided from the scope narrowed by the search text only, so the options stay put while
 * the visitor ticks filters. Each option's count answers "how many products would I get if I
 * ticked this?", i.e. the other groups' selections apply but the option's own group does not.
 */
export function deriveFacets(
  scope: readonly Product[],
  query: ListingQuery,
  { includeSpecs }: { includeSpecs: boolean },
): Facet[] {
  const base = scope.filter((product) => matchesSearch(product, query.q))
  const facets: Facet[] = []

  const brandKey: GroupKey = { kind: 'brand' }
  const brandsPresent = [...new Set(base.map((product) => product.brand))]
  if (brandsPresent.length > 1 || query.brands.length > 0) {
    const present = new Set<BrandId>([...brandsPresent, ...query.brands])
    facets.push({
      key: brandKey,
      id: 'brand',
      title: 'מותג',
      options: [...present]
        .sort((a, b) => collator.compare(BRANDS[a].name, BRANDS[b].name))
        .map((brand) => ({
          value: brand,
          label: BRANDS[brand].name,
          selected: query.brands.includes(brand),
          count: base.filter(
            (product) => product.brand === brand && passesGroups(product, query, brandKey),
          ).length,
        })),
    })
  }

  if (includeSpecs) {
    for (const group of deriveSpecGroups(base)) {
      const key: GroupKey = { kind: 'spec', label: group.label }
      const selected = query.specs.get(group.label) ?? []
      facets.push({
        key,
        id: `spec-${facets.length}`,
        title: group.label,
        options: [...group.values].sort(collator.compare).map((value) => ({
          value,
          label: value,
          selected: selected.includes(value),
          count: base.filter(
            (product) =>
              passesGroups(product, query, key) &&
              product.specs.some((spec) => spec.label === group.label && spec.value === value),
          ).length,
        })),
      })
    }
  }

  return facets
}

/**
 * Drops specification selections that are not among the filters offered for this scope: an
 * unknown label, a known label with an unknown value, or any specification filter at all where
 * none are offered (`includeSpecs: false`). Without this, a hand-edited or outdated URL such as
 * `?s.fake=value` would filter on something the visitor cannot see and return no products.
 *
 * What is offered is decided without the current selection (the same rules as `deriveFacets`),
 * so valid selections are kept exactly as they are. Brand ids are already validated by the
 * parser. Returns the same object when nothing had to be dropped.
 */
export function sanitizeSpecFilters(
  scope: readonly Product[],
  state: ListingState,
  { includeSpecs }: { includeSpecs: boolean },
): ListingState {
  if (state.specs.size === 0) return state

  const offered = new Map<string, ReadonlySet<string>>()
  if (includeSpecs) {
    const unfiltered = { ...state, brands: [], specs: new Map<string, readonly string[]>() }
    for (const facet of deriveFacets(scope, unfiltered, { includeSpecs })) {
      if (facet.key.kind === 'spec') {
        offered.set(facet.key.label, new Set(facet.options.map((option) => option.value)))
      }
    }
  }

  const specs = new Map<string, readonly string[]>()
  let changed = false
  for (const [label, values] of state.specs) {
    const allowed = offered.get(label)
    const kept = allowed ? values.filter((value) => allowed.has(value)) : []
    if (kept.length !== values.length) changed = true
    if (kept.length > 0) specs.set(label, kept)
  }
  return changed ? { ...state, specs } : state
}
