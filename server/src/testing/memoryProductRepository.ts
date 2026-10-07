import { isDeepStrictEqual } from 'node:util'
import { searchScore, searchWords } from '../../../src/features/products/listing/search.ts'
import type { ProductRepository } from '../products/repository.ts'
import type { Product, ProductFilter, ProductRange } from '../products/types.ts'

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const collator = new Intl.Collator('he', { numeric: true })

/** The selection of a filter, as plain data: a product has to pass every part of it. */
function matches(product: Product, filter: ProductFilter): boolean {
  if (filter.category !== undefined && product.category !== filter.category) return false
  if (filter.brands.length > 0 && !filter.brands.includes(product.brand)) return false
  for (const [label, values] of filter.specs) {
    if (values.length === 0) continue
    if (!product.specs.some((spec) => spec.label === label && values.includes(spec.value))) {
      return false
    }
  }
  const { search } = filter
  if (search !== undefined && searchWords(search.query).length > 0) {
    return searchScore(product, search.query, { deep: search.deep }) > 0
  }
  return true
}

/** The order of `toMongoSort`, with the collation MongoDB is asked for by the name sorts. */
function compare(sort: ProductRange['sort']) {
  const name = (a: Product, b: Product) => collator.compare(a.name, b.name)
  return (a: Product, b: Product): number => {
    switch (sort) {
      case 'price-asc':
        return a.price.current - b.price.current || name(a, b) || byText(a.id, b.id)
      case 'price-desc':
        return b.price.current - a.price.current || name(a, b) || byText(a.id, b.id)
      case 'name-asc':
        return name(a, b) || byText(a.id, b.id)
      case 'name-desc':
        return name(b, a) || byText(a.id, b.id)
      default:
        return byText(a.id, b.id)
    }
  }
}

/**
 * A `ProductRepository` that keeps the products in memory, with the behaviour the real one has:
 * the same filters, sorts and counts, upserts matched by `id`, a replacement that changes nothing
 * counted as unchanged, and no deletion. It lets the service, the routes and the seed be tested
 * without MongoDB. The real repository is checked against MongoDB by the optional integration
 * test, which also compares the two.
 */
export function createMemoryProductRepository(initial: readonly Product[] = []) {
  const stored = new Map<string, Product>(initial.map((product) => [product.id, product]))
  const calls: string[] = []

  const matching = (filter: ProductFilter) =>
    [...stored.values()].filter((product) => matches(product, filter))

  const repository: ProductRepository = {
    ensureIndexes() {
      calls.push('ensureIndexes')
      return Promise.resolve()
    },

    ensureSearchFields() {
      calls.push('ensureSearchFields')
      return Promise.resolve(0)
    },

    list(filter, { sort, skip, limit }) {
      const sorted = matching(filter).sort(compare(sort))
      return Promise.resolve({ items: sorted.slice(skip, skip + limit), total: sorted.length })
    },

    findAll(filter) {
      return Promise.resolve(matching(filter).sort(compare('default')))
    },

    count(filter) {
      return Promise.resolve(matching(filter).length)
    },

    brandCounts(filter) {
      const counts = new Map<Product['brand'], number>()
      for (const product of matching(filter)) {
        counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1)
      }
      return Promise.resolve([...counts].map(([brand, count]) => ({ brand, count })))
    },

    specValueCounts(filter) {
      const counts = new Map<string, { label: string; value: string; count: number }>()
      for (const product of matching(filter)) {
        // A product counts once for each of its distinct (label, value) pairs.
        for (const { label, value } of new Map(
          product.specs.map((spec) => [JSON.stringify([spec.label, spec.value]), spec]),
        ).values()) {
          const key = JSON.stringify([label, value])
          const entry = counts.get(key) ?? { label, value, count: 0 }
          entry.count += 1
          counts.set(key, entry)
        }
      }
      return Promise.resolve([...counts.values()])
    },

    findById(id) {
      return Promise.resolve(stored.get(id) ?? null)
    },

    findByIds(ids) {
      const wanted = new Set(ids)
      return Promise.resolve([...stored.values()].filter((product) => wanted.has(product.id)))
    },

    upsertMany(products) {
      calls.push('upsertMany')
      const result = { inserted: 0, updated: 0, unchanged: 0 }
      for (const product of products) {
        const existing = stored.get(product.id)
        if (existing === undefined) result.inserted += 1
        else if (isDeepStrictEqual(existing, product)) result.unchanged += 1
        else result.updated += 1
        stored.set(product.id, structuredClone(product))
      }
      return Promise.resolve(result)
    },

    countNotIn(ids) {
      const wanted = new Set(ids)
      return Promise.resolve([...stored.keys()].filter((id) => !wanted.has(id)).length)
    },
  }

  return { repository, stored, calls }
}
