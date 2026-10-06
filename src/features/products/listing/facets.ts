import { z } from 'zod'
import { BRAND_IDS, BRANDS } from '../brands'
import type { ListingState } from './query'

/* ---------------------------------------------------------------------------------------------
 * The filter options of a listing. The API decides which options exist and how many products
 * each would give (`facets=true` on `GET /api/products`); this file only describes what it sends,
 * and turns it into what the filter panel shows.
 * ------------------------------------------------------------------------------------------- */

const optionSchema = z.object({ value: z.string(), count: z.number().int().min(0) })

/** The `facets` of an answer of `GET /api/products?facets=true`. */
export const listingFacetsSchema = z.object({
  /** Empty when there is nothing to choose between. */
  brands: z.array(z.object({ value: z.enum(BRAND_IDS), count: z.number().int().min(0) })),
  specs: z.array(z.object({ label: z.string(), options: z.array(optionSchema) })),
})

export type ListingFacets = z.infer<typeof listingFacetsSchema>

export type GroupKey = { kind: 'brand' } | { kind: 'spec'; label: string }

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

/** The filter groups of the panel: the brands, then one group per specification. */
export function toFacets(facets: ListingFacets, state: ListingState): Facet[] {
  const groups: Facet[] = []

  if (facets.brands.length > 0) {
    groups.push({
      key: { kind: 'brand' },
      id: 'brand',
      title: 'מותג',
      options: facets.brands.map(({ value, count }) => ({
        value,
        label: BRANDS[value].name,
        count,
        selected: state.brands.includes(value),
      })),
    })
  }

  for (const { label, options } of facets.specs) {
    const selected = state.specs.get(label) ?? []
    groups.push({
      key: { kind: 'spec', label },
      id: `spec-${groups.length}`,
      title: label,
      options: options.map(({ value, count }) => ({
        value,
        label: value,
        count,
        selected: selected.includes(value),
      })),
    })
  }

  return groups
}

/**
 * Drops specification selections that are not among the options the API offers: an unknown label,
 * a known label with an unknown value, or any specification filter at all where none are offered.
 * The API ignores them too, so a hand-edited or outdated URL such as `?s.fake=value` neither
 * filters on something the visitor cannot see nor shows a chip for it. Valid selections are kept
 * exactly as they are. Returns the same object when nothing had to be dropped.
 */
export function sanitizeSpecFilters(state: ListingState, facets: ListingFacets): ListingState {
  if (state.specs.size === 0) return state

  const offered = new Map(facets.specs.map(({ label, options }) => [label, options]))
  const specs = new Map<string, readonly string[]>()
  let changed = false
  for (const [label, values] of state.specs) {
    const options = offered.get(label)
    const kept = options ? values.filter((v) => options.some((option) => option.value === v)) : []
    if (kept.length !== values.length) changed = true
    if (kept.length > 0) specs.set(label, kept)
  }
  return changed ? { ...state, specs } : state
}
