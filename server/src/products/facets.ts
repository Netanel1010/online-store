import { BRANDS, type BrandId } from '../../../src/features/products/brands.ts'
import type { BrandCount, SpecValueCount } from './types.ts'

/**
 * The filter options of a listing (brands, and the specifications of one category) with the number
 * of products each would give, as the storefront's filter panel shows them. This file holds the
 * rules; the counts themselves come from MongoDB (see the repository), already grouped.
 *
 * Which options exist is decided from the scope (the category, narrowed by the search text) and
 * does not change while the visitor ticks filters. The count of an option answers "how many
 * products would I get if I ticked this?": the other groups' selections apply, the option's own
 * group does not.
 */

export interface FacetOption {
  value: string
  count: number
}

export interface Facets {
  /** Empty when there is nothing to choose between. Otherwise one option per brand. */
  brands: { value: BrandId; count: number }[]
  /** One group per specification label that is useful as a filter in this scope. */
  specs: { label: string; options: FacetOption[] }[]
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

const collator = new Intl.Collator('he', { numeric: true })

/** The specification labels worth offering, each with its values, from the values of the scope. */
export function offeredSpecGroups(scopeSpecs: readonly SpecValueCount[]) {
  const byLabel = new Map<string, { values: string[]; products: number }>()
  for (const { label, value, count } of scopeSpecs) {
    const group = byLabel.get(label) ?? { values: [], products: 0 }
    group.values.push(value)
    group.products += count
    byLabel.set(label, group)
  }

  const rules = SPEC_FACET_RULES
  return [...byLabel]
    .filter(
      ([, { values, products }]) =>
        products >= rules.minProducts &&
        values.length >= rules.minValues &&
        values.length <= rules.maxValues &&
        (products < rules.ratioMinProducts || values.length / products <= rules.maxDistinctRatio) &&
        values.every((value) => value.length <= rules.maxValueLength),
    )
    .map(([label, { values }]) => ({ label, values: values.sort(collator.compare) }))
    .sort((a, b) => collator.compare(a.label, b.label))
}

/**
 * Drops specification selections that are not among the offered options: an unknown label, a known
 * label with an unknown value, or a label that is not offered at all. Without this, a hand-edited
 * or outdated URL such as `?s.fake=value` would filter on something the visitor cannot see and
 * return no products. What is offered does not depend on the selection, so valid selections are
 * kept exactly as they are.
 */
export function sanitizeSpecSelection(
  selection: ReadonlyMap<string, readonly string[]>,
  offered: ReturnType<typeof offeredSpecGroups>,
): Map<string, string[]> {
  const allowed = new Map(offered.map(({ label, values }) => [label, new Set(values)]))
  const kept = new Map<string, string[]>()
  for (const [label, values] of selection) {
    const known = allowed.get(label)
    const valid = known ? values.filter((value) => known.has(value)) : []
    if (valid.length > 0) kept.set(label, valid)
  }
  return kept
}

export interface FacetCounts {
  /** Products per brand in the scope. Decides whether there is a choice between brands. */
  scopeBrands: readonly BrandCount[]
  /** Products per brand with the specification selection applied (the brand selection is not). */
  brandCounts: readonly BrandCount[]
  /** Products per specification value in the scope. Decides which groups are offered. */
  scopeSpecs: readonly SpecValueCount[]
  /**
   * Products per value of one label, with the brand selection and the selection of every other
   * label applied.
   */
  specCountsFor(label: string): readonly SpecValueCount[]
}

export function buildFacets(
  counts: FacetCounts,
  selection: { brands: readonly BrandId[] },
  { includeSpecs }: { includeSpecs: boolean },
): Facets {
  const present = new Set<BrandId>([
    ...counts.scopeBrands.filter(({ count }) => count > 0).map(({ brand }) => brand),
  ])
  const brands: Facets['brands'] = []
  if (present.size > 1 || selection.brands.length > 0) {
    // A selected brand is listed even when the scope has none of it, so it can be unticked.
    const listed = new Set<BrandId>([...present, ...selection.brands])
    const countOf = new Map(counts.brandCounts.map(({ brand, count }) => [brand, count]))
    brands.push(
      ...[...listed]
        .sort((a, b) => collator.compare(BRANDS[a].name, BRANDS[b].name))
        .map((brand) => ({ value: brand, count: countOf.get(brand) ?? 0 })),
    )
  }

  const specs = includeSpecs
    ? offeredSpecGroups(counts.scopeSpecs).map(({ label, values }) => {
        const countOf = new Map(counts.specCountsFor(label).map((c) => [c.value, c.count]))
        return {
          label,
          options: values.map((value) => ({ value, count: countOf.get(value) ?? 0 })),
        }
      })
    : []

  return { brands, specs }
}
