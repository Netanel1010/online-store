import { productSchema } from '../../../src/features/products/schema.ts'
import type { Database } from '../db/database.ts'
import type { Product, UpsertResult } from './types.ts'

const COLLECTION = 'products'

/**
 * Everything that knows about MongoDB for products: the collection, its queries and its index. It
 * takes and returns validated `Product`s and knows nothing about HTTP.
 *
 * A document is a `Product` as it is, plus MongoDB's own `_id`. The product's identifier for the
 * outside world is `id` (the manufacturer SKU), which is a separate field with a unique index, so
 * `_id` never leaves this file.
 */
export interface ProductRepository {
  /** Creates the unique index on `id` if it is missing. Safe to call any number of times. */
  ensureIndexes(): Promise<void>
  /** One page of products in a fixed order (by `id`), and the number of products in all. */
  list(range: { skip: number; limit: number }): Promise<{ items: Product[]; total: number }>
  findById(id: string): Promise<Product | null>
  /**
   * Inserts the products that do not exist and updates the ones that do, matched by `id`. Other
   * documents are never touched, and nothing is deleted.
   */
  upsertMany(products: readonly Product[]): Promise<UpsertResult>
  /** How many stored products have an `id` that is not in `ids`. */
  countNotIn(ids: readonly string[]): Promise<number>
}

/** A stored document must still be a valid product: a bad one is a data problem, not a client error. */
function toProduct(document: unknown): Product {
  const result = productSchema.safeParse(document)
  if (!result.success) {
    const id = (document as { id?: unknown } | null)?.id
    throw new Error(`The stored product "${String(id)}" does not match the product schema`, {
      cause: result.error,
    })
  }
  return result.data
}

export function createProductRepository(database: Database): ProductRepository {
  // Looked up when used, not when created: the database is connected before the first request.
  const products = () => database.db().collection<Product>(COLLECTION)

  return {
    async ensureIndexes() {
      await products().createIndex({ id: 1 }, { unique: true, name: 'id_unique' })
    },

    async list({ skip, limit }) {
      const collection = products()
      // The two queries are independent, so they run together. Sorting by the unique `id` gives a
      // stable order for paging, and the unique index is what serves it.
      const [documents, total] = await Promise.all([
        collection
          .find({}, { projection: { _id: 0 } })
          .sort({ id: 1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments({}),
      ])
      return { items: documents.map(toProduct), total }
    },

    async findById(id) {
      const document = await products().findOne({ id }, { projection: { _id: 0 } })
      return document === null ? null : toProduct(document)
    },

    async upsertMany(items) {
      const result = await products().bulkWrite(
        items.map((product) => ({
          // $set, not a replacement: MongoDB reports an update that changes nothing as not
          // modified, which is what "unchanged" counts (a replacement was reported as modified even
          // when identical, against a real server). The product's fields are all set, and `_id` is kept.
          updateOne: { filter: { id: product.id }, update: { $set: product }, upsert: true },
        })),
      )
      return {
        inserted: result.upsertedCount,
        updated: result.modifiedCount,
        unchanged: result.matchedCount - result.modifiedCount,
      }
    },

    countNotIn(ids) {
      return products().countDocuments({ id: { $nin: [...ids] } })
    },
  }
}
