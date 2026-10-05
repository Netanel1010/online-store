import { isDeepStrictEqual } from 'node:util'
import type { ProductRepository } from '../products/repository.ts'
import type { Product } from '../products/types.ts'

/**
 * A `ProductRepository` that keeps the products in memory, with the behaviour the real one has:
 * ordered by `id`, upserts matched by `id`, a replacement that changes nothing counted as
 * unchanged, and no deletion. It lets the service, the routes and the seed be tested without
 * MongoDB. The real repository is checked against MongoDB by the optional integration test.
 */
export function createMemoryProductRepository(initial: readonly Product[] = []) {
  const stored = new Map<string, Product>(initial.map((product) => [product.id, product]))
  const calls: string[] = []

  const repository: ProductRepository = {
    ensureIndexes() {
      calls.push('ensureIndexes')
      return Promise.resolve()
    },

    list({ skip, limit }) {
      const sorted = [...stored.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      return Promise.resolve({ items: sorted.slice(skip, skip + limit), total: sorted.length })
    },

    findById(id) {
      return Promise.resolve(stored.get(id) ?? null)
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
