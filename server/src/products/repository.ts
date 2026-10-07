import { BRAND_IDS, type BrandId } from '../../../src/features/products/brands.ts'
import { productSchema } from '../../../src/features/products/schema.ts'
import type { Database } from '../db/database.ts'
import { NAME_COLLATION, sortNeedsCollation, toMongoFilter, toMongoSort } from './productFilter.ts'
import { buildSearchFields, SEARCH_VERSION } from './searchFields.ts'
import type {
  BrandCount,
  Product,
  ProductFilter,
  ProductRange,
  SpecValueCount,
  UpsertResult,
} from './types.ts'

const COLLECTION = 'products'

/** What a product read needs: the product itself, without MongoDB's `_id` and the search text. */
const PRODUCT_PROJECTION = { _id: 0, search: 0 } as const

/**
 * Everything that knows about MongoDB for products: the collection, its queries and its index. It
 * takes and returns validated `Product`s and knows nothing about HTTP.
 *
 * A document is a `Product` as it is, plus MongoDB's own `_id` and a `search` object: the
 * normalized text the search works on (see searchFields.ts). The product's identifier for the
 * outside world is `id` (the manufacturer SKU), which is a separate field with a unique index, so
 * `_id` and `search` never leave this file.
 *
 * The filtering, sorting and counting of a listing are queries, so MongoDB does the work and only
 * what a page needs comes back. The one exception is `findAll`, for the ranking of search results.
 */
export interface ProductRepository {
  /** Creates the unique index on `id` if it is missing. Safe to call any number of times. */
  ensureIndexes(): Promise<void>
  /**
   * Stores the search text with every product that has none, or an older version of it, so a
   * database filled before the search existed (or by an older seed) becomes searchable when the
   * API starts. Returns how many products were written. Safe to call any number of times.
   */
  ensureSearchFields(): Promise<number>
  /**
   * One page of the products that match the filter, in the order of the range, and how many
   * products match in all.
   */
  list(filter: ProductFilter, range: ProductRange): Promise<{ items: Product[]; total: number }>
  /** Every product that matches the filter, by `id`. Only for ranking search results. */
  findAll(filter: ProductFilter): Promise<Product[]>
  /** How many products match the filter. */
  count(filter: ProductFilter): Promise<number>
  /** The matching products per brand (only the brands that have some). */
  brandCounts(filter: ProductFilter): Promise<BrandCount[]>
  /**
   * The matching products per specification value, counting a product once for each of its
   * values (only the values that have some).
   */
  specValueCounts(filter: ProductFilter): Promise<SpecValueCount[]>
  findById(id: string): Promise<Product | null>
  /** The products with these ids, in no particular order. An id with no product is left out. */
  findByIds(ids: readonly string[]): Promise<Product[]>
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

    async ensureSearchFields() {
      const stale = await products()
        .find({ 'search.v': { $ne: SEARCH_VERSION } }, { projection: { _id: 0, search: 0 } })
        .toArray()
      // Only products get the text: anything else that is in the collection is left alone.
      const writes = stale.flatMap((document) => {
        const parsed = productSchema.safeParse(document)
        if (!parsed.success) return []
        return [
          {
            updateOne: {
              filter: { id: parsed.data.id },
              update: { $set: { search: buildSearchFields(parsed.data) } },
            },
          },
        ]
      })
      if (writes.length > 0) await products().bulkWrite(writes)
      return writes.length
    },

    async list(filter, { sort, skip, limit }) {
      const collection = products()
      const query = toMongoFilter(filter)
      // The two queries are independent, so they run together. Every sort ends with the unique
      // `id`, which gives a stable order for paging (the default sort is served by its index).
      const [documents, total] = await Promise.all([
        collection
          .find(query, {
            projection: PRODUCT_PROJECTION,
            ...(sortNeedsCollation(sort) && { collation: NAME_COLLATION }),
          })
          .sort(toMongoSort(sort))
          .skip(skip)
          .limit(limit)
          .toArray(),
        collection.countDocuments(query),
      ])
      return { items: documents.map(toProduct), total }
    },

    async findAll(filter) {
      const documents = await products()
        .find(toMongoFilter(filter), { projection: PRODUCT_PROJECTION })
        .sort({ id: 1 })
        .toArray()
      return documents.map(toProduct)
    },

    count(filter) {
      return products().countDocuments(toMongoFilter(filter))
    },

    async brandCounts(filter) {
      const groups = await products()
        .aggregate<{ _id: unknown; count: number }>([
          { $match: toMongoFilter(filter) },
          { $group: { _id: '$brand', count: { $sum: 1 } } },
        ])
        .toArray()
      return groups
        .filter((group): group is { _id: BrandId; count: number } =>
          (BRAND_IDS as readonly unknown[]).includes(group._id),
        )
        .map((group) => ({ brand: group._id, count: group.count }))
    },

    async specValueCounts(filter) {
      const groups = await products()
        .aggregate<{ _id: { label: string; value: string }; count: number }>([
          { $match: toMongoFilter(filter) },
          // One entry per distinct (label, value) of a product, so a product counts once for each.
          {
            $project: {
              _id: 0,
              pairs: {
                $setUnion: [
                  {
                    $map: {
                      input: '$specs',
                      as: 'spec',
                      in: { label: '$$spec.label', value: '$$spec.value' },
                    },
                  },
                  [],
                ],
              },
            },
          },
          { $unwind: '$pairs' },
          { $group: { _id: '$pairs', count: { $sum: 1 } } },
          { $sort: { '_id.label': 1, '_id.value': 1 } },
        ])
        .toArray()
      return groups.map((group) => ({ ...group._id, count: group.count }))
    },

    async findById(id) {
      const document = await products().findOne({ id }, { projection: PRODUCT_PROJECTION })
      return document === null ? null : toProduct(document)
    },

    async findByIds(ids) {
      const documents = await products()
        .find({ id: { $in: [...ids] } }, { projection: PRODUCT_PROJECTION })
        .toArray()
      return documents.map(toProduct)
    },

    async upsertMany(items) {
      const result = await products().bulkWrite(
        items.map((product) => ({
          // $set, not a replacement: MongoDB reports an update that changes nothing as not
          // modified, which is what "unchanged" counts (a replacement was reported as modified even
          // when identical, against a real server). The product's fields are all set, and `_id` is kept.
          updateOne: {
            filter: { id: product.id },
            update: { $set: { ...product, search: buildSearchFields(product) } },
            upsert: true,
          },
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
