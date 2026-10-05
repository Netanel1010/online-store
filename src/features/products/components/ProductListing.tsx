import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { EmptyState } from '@/components/shared/StateMessages'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import type { BrandId } from '../brands'
import type { CategoryId } from '../categories'
import {
  deriveFacets,
  filterProducts,
  sanitizeSpecFilters,
  sortProducts,
  type Facet,
} from '../listing/filtering'
import {
  clearFilters,
  countActiveFilters,
  setSort,
  toggleBrand,
  toggleSpecValue,
  type ListingState,
} from '../listing/query'
import { rankBySearch } from '../listing/search'
import { useListingState } from '../listing/useListingState'
import type { Product } from '../schema'
import { ActiveFilters } from './ActiveFilters'
import { CategoryFilterNav } from './CategoryFilterNav'
import { FilterPanel } from './FilterPanel'
import { ProductGrid } from './ProductGrid'
import { SortSelect } from './SortSelect'

interface ProductListingProps {
  /** The whole catalog, used for the category navigation counts. */
  allProducts: readonly Product[]
  /** The products being browsed: everything, one category, or everything for a search. */
  scopeProducts: readonly Product[]
  /**
   * - all: every product (brand filter and sort)
   * - category: one category (adds the specification filters, which only make sense within one)
   * - search: search results (the search text comes from the URL)
   */
  mode: 'all' | 'category' | 'search'
  activeCategory?: CategoryId
}

function countText(count: number) {
  if (count === 0) return 'לא נמצאו מוצרים'
  return count === 1 ? 'מוצר אחד' : `${count} מוצרים`
}

/** Shared body of the products, category and search pages. All of its state lives in the URL. */
export function ProductListing({
  allProducts,
  scopeProducts,
  mode,
  activeCategory,
}: ProductListingProps) {
  const search = mode === 'search'
  const includeSpecs = mode === 'category'
  // URL selections that do not exist in this scope's filters are dropped before anything uses them.
  const sanitize = useCallback(
    (candidate: ListingState) => sanitizeSpecFilters(scopeProducts, candidate, { includeSpecs }),
    [scopeProducts, includeSpecs],
  )
  const { state, update } = useListingState({ search, sanitize })
  const [filtersOpen, setFiltersOpen] = useState(false)

  const facets = useMemo(
    () => deriveFacets(scopeProducts, state, { includeSpecs }),
    [scopeProducts, state, includeSpecs],
  )
  const results = useMemo(() => {
    const matching = filterProducts(scopeProducts, state)
    // Without an explicit sort a search lists the best matches first.
    return search && state.q !== '' && state.sort === 'default'
      ? rankBySearch(matching, state.q)
      : sortProducts(matching, state.sort)
  }, [scopeProducts, state, search])
  const activeCount = countActiveFilters(state)

  const toggleFacet = (facet: Facet, value: string) =>
    update((current) =>
      facet.key.kind === 'brand'
        ? toggleBrand(current, value as BrandId)
        : toggleSpecValue(current, facet.key.label, value),
    )
  const clear = () => update(clearFilters)

  if (scopeProducts.length === 0) {
    return (
      <>
        {mode !== 'search' && <CategoryFilterNav products={allProducts} active={activeCategory} />}
        <EmptyState
          title="אין מוצרים להצגה"
          action={
            <Link to={paths.products} className={buttonStyles()}>
              לכל המוצרים
            </Link>
          }
        >
          עדיין אין מוצרים בקטגוריה הזו.
        </EmptyState>
      </>
    )
  }

  const hasPanel = facets.length > 0

  return (
    <>
      {mode !== 'search' && <CategoryFilterNav products={allProducts} active={activeCategory} />}

      <div className={hasPanel ? 'lg:grid lg:grid-cols-[16rem_1fr] lg:items-start lg:gap-8' : ''}>
        {hasPanel && (
          <aside aria-label="סינון" className="mb-6 lg:mb-0">
            <Button
              variant="secondary"
              aria-expanded={filtersOpen}
              aria-controls="filter-panel"
              onClick={() => setFiltersOpen((open) => !open)}
              className="w-full lg:hidden"
            >
              סינון{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
            <div
              id="filter-panel"
              className={`${filtersOpen ? 'block' : 'hidden'} mt-4 lg:mt-0 lg:block`}
            >
              <FilterPanel
                facets={facets}
                activeCount={activeCount}
                onToggle={toggleFacet}
                onClear={clear}
              />
            </div>
          </aside>
        )}

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted">
              {countText(results.length)}
            </p>
            <SortSelect
              value={state.sort}
              defaultLabel={search && state.q !== '' ? 'התאמה לחיפוש' : undefined}
              onChange={(sort) => update((s) => setSort(s, sort))}
            />
          </div>

          <ActiveFilters
            query={state}
            onRemoveBrand={(brand) => update((s) => toggleBrand(s, brand))}
            onRemoveSpec={(label, value) => update((s) => toggleSpecValue(s, label, value))}
            onClear={clear}
          />

          {results.length === 0 ? (
            <EmptyState
              title="לא נמצאו מוצרים"
              details={
                state.q ? (
                  <ul className="list-inside list-disc space-y-1 text-start">
                    <li>בדקו את האיות, או נסו מילה אחת בלבד.</li>
                    <li>
                      אפשר לחפש לפי שם, מותג, קטגוריה, מק&quot;ט או חלק ממספר הדגם (למשל 4070).
                    </li>
                    {activeCount > 0 && <li>נסו להסיר את הסינון שנבחר.</li>}
                  </ul>
                ) : undefined
              }
              action={
                <div className="flex flex-wrap justify-center gap-3">
                  {activeCount > 0 && <Button onClick={clear}>ניקוי סינון</Button>}
                  <Link
                    to={paths.products}
                    className={buttonStyles({ variant: activeCount > 0 ? 'secondary' : 'primary' })}
                  >
                    לכל המוצרים
                  </Link>
                </div>
              }
            >
              {state.q
                ? `לא נמצאו מוצרים עבור “${state.q}”${activeCount > 0 ? ' עם הסינון שנבחר' : ''}.`
                : 'אין מוצרים שמתאימים לסינון שנבחר.'}
            </EmptyState>
          ) : (
            <ProductGrid products={results} headingAs="h2" eagerCount={4} />
          )}
        </div>
      </div>
    </>
  )
}
