import type { SortKey } from '../../../src/features/products/listing/query.ts'
import { escapeRegExp, searchFilter } from './searchFields.ts'
import type { ProductFilter } from './types.ts'

/**
 * Text that has to equal the stored text exactly. A pattern is used instead of an equality because
 * a collation (needed for the name sort) would compare "8GB" and "08GB" as equal, and a regular
 * expression is not affected by it. `(?![\s\S])` is the end of the text: unlike `$`, it does not
 * also match before a trailing line break.
 */
const exactly = (texts: readonly string[]) =>
  String.raw`^(?:${texts.map(escapeRegExp).join('|')})(?![\s\S])`

/**
 * The MongoDB condition for a `ProductFilter`: all of its parts have to hold. The category and the
 * brands are plain equalities; each specification label must have one of the selected values;
 * the search is a pattern per word on the stored search text (see searchFields.ts).
 */
export function toMongoFilter(filter: ProductFilter): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = []

  if (filter.category !== undefined) conditions.push({ category: filter.category })
  if (filter.brands.length > 0) conditions.push({ brand: { $in: [...filter.brands] } })
  if (filter.search !== undefined) {
    const search = searchFilter(filter.search.query, filter.search.deep)
    if (Object.keys(search).length > 0) conditions.push(search)
  }
  for (const [label, values] of filter.specs) {
    if (values.length === 0) continue
    conditions.push({
      specs: {
        $elemMatch: { label: { $regex: exactly([label]) }, value: { $regex: exactly(values) } },
      },
    })
  }

  return conditions.length === 0 ? {} : { $and: conditions }
}

/**
 * The order of a listing. Without a sort it is by `id`, the unique and stable key, which the
 * unique index serves. The others end with the id too, so that products that compare equal never
 * change places between two pages.
 */
export function toMongoSort(sort: SortKey): Record<string, 1 | -1> {
  switch (sort) {
    case 'price-asc':
      return { 'price.current': 1, name: 1, id: 1 }
    case 'price-desc':
      return { 'price.current': -1, name: 1, id: 1 }
    case 'name-asc':
      return { name: 1, id: 1 }
    case 'name-desc':
      return { name: -1, id: 1 }
    default:
      return { id: 1 }
  }
}

/**
 * The name sort of the storefront: Hebrew rules, numbers compared as numbers ("GTX 970" before
 * "GTX 1070"). It is also what breaks the ties of the price sort. The plain order by `id` needs none.
 */
export const NAME_COLLATION = { locale: 'he', numericOrdering: true } as const

export const sortNeedsCollation = (sort: SortKey) => sort !== 'default'
