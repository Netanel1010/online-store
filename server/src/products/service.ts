import { rankBySearch, searchWords } from '../../../src/features/products/listing/search.ts'
import { HttpError } from '../lib/httpError.ts'
import { buildFacets, offeredSpecGroups, sanitizeSpecSelection, type Facets } from './facets.ts'
import type { ProductListQuery } from './listQuery.ts'
import type { ProductRepository } from './repository.ts'
import type { Product, ProductFilter, ProductPage, SpecValueCount } from './types.ts'

export const DEFAULT_LIMIT = 20
/** A page is never larger than this, however much a client asks for. */
export const MAX_LIMIT = 100

/** The one answer to a page or a limit that is not allowed, wherever it is noticed. */
export const invalidPagination = () =>
  new HttpError(
    400,
    'invalid_pagination',
    `page must be a positive integer and limit an integer from 1 to ${MAX_LIMIT}`,
  )

/** What the service needs to list products. Everything is optional. */
export type ProductListParams = Partial<ProductListQuery>

export interface ProductService {
  list(params?: ProductListParams): Promise<ProductPage>
  get(id: string): Promise<Product>
}

type ReadingRepository = Pick<
  ProductRepository,
  'list' | 'findAll' | 'count' | 'brandCounts' | 'specValueCounts' | 'findById'
>

const withoutLabel = (specs: ReadonlyMap<string, readonly string[]>, label: string) =>
  new Map([...specs].filter(([key]) => key !== label))

/**
 * The rules of the product API: how a listing is searched, filtered, sorted and paged, and what it
 * means to look a product up. It talks to the repository, never to MongoDB, and knows nothing
 * about Express. A failure the client caused is thrown as an `HttpError`, so the central error
 * handler answers it.
 */
export function createProductService(repository: ReadingRepository): ProductService {
  return {
    async list({
      page = 1,
      limit = DEFAULT_LIMIT,
      q = '',
      category,
      brands = [],
      specs = new Map(),
      sort = 'default',
      facets = false,
    } = {}) {
      const skip = (page - 1) * limit
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_LIMIT ||
        !Number.isSafeInteger(skip)
      ) {
        throw invalidPagination()
      }

      // The search looks at the name, SKU, brand and category first, and only when nothing in the
      // category matches there at all, at the specifications and features too (see search.ts).
      // That is decided on the category alone, so ticking a brand never changes where it looks.
      const searching = searchWords(q).length > 0
      const deep =
        searching &&
        (await repository.count({
          category,
          search: { query: q, deep: false },
          brands: [],
          specs: new Map(),
        })) === 0
      // The scope: what is being browsed, before any filter is ticked.
      const scope: ProductFilter = {
        category,
        search: searching ? { query: q, deep } : undefined,
        brands: [],
        specs: new Map(),
      }

      // Specification filters only exist within one category, and only for the options that are
      // offered there. A selection that is not (an unknown label or value, or no category) is
      // ignored instead of returning no products for something the visitor cannot see.
      const includeSpecs = category !== undefined
      let scopeSpecs: readonly SpecValueCount[] = []
      let selectedSpecs = new Map<string, string[]>()
      if (includeSpecs && (specs.size > 0 || facets)) {
        scopeSpecs = await repository.specValueCounts(scope)
        selectedSpecs = sanitizeSpecSelection(specs, offeredSpecGroups(scopeSpecs))
      }
      const filter: ProductFilter = { ...scope, brands, specs: selectedSpecs }

      const listed = (async () => {
        // Without a sort, a search lists the best matches first. The ranking needs every match,
        // so the matches are read (only those, not the collection) and paged here.
        if (searching && sort === 'default') {
          const matches = await repository.findAll(filter)
          return {
            items: rankBySearch(matches, q).slice(skip, skip + limit),
            total: matches.length,
          }
        }
        return repository.list(filter, { sort, skip, limit })
      })()

      const [{ items, total }, filterOptions] = await Promise.all([
        listed,
        facets ? facetsOf(repository, scope, filter, scopeSpecs, includeSpecs) : undefined,
      ])

      // A page past the end is not an error: it is empty, and the total says where the end is.
      return {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        ...(filterOptions && { facets: filterOptions }),
      }
    },

    async get(id) {
      const product = await repository.findById(id)
      if (product === null) throw new HttpError(404, 'product_not_found', 'Product not found')
      return product
    },
  }
}

/** The counts behind the filter options, each asked as one grouped query, all together. */
async function facetsOf(
  repository: Pick<ProductRepository, 'brandCounts' | 'specValueCounts'>,
  scope: ProductFilter,
  filter: ProductFilter,
  scopeSpecs: readonly SpecValueCount[],
  includeSpecs: boolean,
): Promise<Facets> {
  const offered = new Set((includeSpecs ? offeredSpecGroups(scopeSpecs) : []).map((g) => g.label))
  // The labels with a selection of their own are counted without it, each in a query of its own.
  const ownLabels = [...filter.specs.keys()].filter((label) => offered.has(label))

  const [scopeBrands, brandCounts, allSelected, ...withoutOwn] = await Promise.all([
    repository.brandCounts(scope),
    // The brand options count with the specification selection, but not the brand selection.
    repository.brandCounts({ ...scope, specs: filter.specs }),
    // Specification options count with the brand selection and every other label's selection. The
    // labels without a selection of their own share one query that applies all of them.
    offered.size > 0 ? repository.specValueCounts(filter) : [],
    ...ownLabels.map((label) =>
      repository.specValueCounts({ ...filter, specs: withoutLabel(filter.specs, label) }),
    ),
  ])
  const ownCounts = new Map(ownLabels.map((label, index) => [label, withoutOwn[index] ?? []]))

  return buildFacets(
    {
      scopeBrands,
      brandCounts,
      scopeSpecs,
      specCountsFor: (label) =>
        (ownCounts.get(label) ?? allSelected).filter((count) => count.label === label),
    },
    { brands: filter.brands },
    { includeSpecs },
  )
}
