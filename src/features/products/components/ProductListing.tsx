import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { SlowLoadNotice } from '@/components/shared/SlowLoadNotice'
import { EmptyState, ErrorState } from '@/components/shared/StateMessages'
import { Button } from '@/components/ui/Button'
import { buttonStyles } from '@/components/ui/buttonStyles'
import type { BrandId } from '../brands'
import type { CategoryId } from '../categories'
import { sanitizeSpecFilters, toFacets, type Facet } from '../listing/facets'
import {
  clearFilters,
  countActiveFilters,
  setSort,
  toggleBrand,
  toggleSpecValue,
  type ListingState,
} from '../listing/query'
import { useListingState } from '../listing/useListingState'
import { useLoadedCatalog } from '../useProductCatalog'
import { useProductListing } from '../useProductListing'
import { ActiveFilters } from './ActiveFilters'
import { CategoryFilterNav } from './CategoryFilterNav'
import { FilterPanel } from './FilterPanel'
import { ProductGrid, ProductGridSkeleton } from './ProductGrid'
import { SortSelect } from './SortSelect'

interface ProductListingProps {
  /**
   * - all: every product (brand filter and sort)
   * - category: one category (adds the specification filters, which only make sense within one)
   * - search: search results (the search text comes from the URL)
   */
  mode: 'all' | 'category' | 'search'
  /** The category to list, for the category mode. */
  category?: CategoryId
}

function countText(count: number) {
  if (count === 0) return 'לא נמצאו מוצרים'
  return count === 1 ? 'מוצר אחד' : `${count} מוצרים`
}

/**
 * Shared body of the products, category and search pages. All of its state lives in the URL, and
 * the API does the work: the search text, the filters and the sort are sent to it, and it answers
 * with the matching products and with the filter options (with their counts) to show.
 */
export function ProductListing({ mode, category }: ProductListingProps) {
  const search = mode === 'search'
  const includeSpecs = mode === 'category'
  // Specification filters only exist within a category: on the other pages they are not read.
  const ignoreSpecs = useCallback(
    (candidate: ListingState) =>
      includeSpecs || candidate.specs.size === 0 ? candidate : { ...candidate, specs: new Map() },
    [includeSpecs],
  )
  const { state, update } = useListingState({ search, sanitize: ignoreSpecs })
  const [filtersOpen, setFiltersOpen] = useState(false)

  const catalog = useLoadedCatalog()
  const loaded = useProductListing({ ...state, category: includeSpecs ? category : undefined })

  const nav = catalog && mode !== 'search' && (
    <CategoryFilterNav products={catalog} active={includeSpecs ? category : undefined} />
  )

  if (loaded.status === 'loading') {
    return (
      <>
        {nav}
        <ProductGridSkeleton />
        <SlowLoadNotice />
      </>
    )
  }
  if (loaded.status === 'error') {
    return (
      <>
        {nav}
        <ErrorState onRetry={loaded.retry} />
      </>
    )
  }

  const { listing, refreshing } = loaded
  // The API ignores specification selections it does not offer, so they are not shown either.
  const shown = sanitizeSpecFilters(state, listing.facets)
  const facets = toFacets(listing.facets, shown)
  const activeCount = countActiveFilters(shown)

  // Changes start from what is shown, so an invalid part of the URL goes away with the next change.
  const change = (apply: (current: ListingState) => ListingState) =>
    update((current) => apply(sanitizeSpecFilters(current, listing.facets)))
  const toggleFacet = (facet: Facet, value: string) =>
    change((current) =>
      facet.key.kind === 'brand'
        ? toggleBrand(current, value as BrandId)
        : toggleSpecValue(current, facet.key.label, value),
    )
  const clear = () => change(clearFilters)

  // Nothing to list even without a search or a filter: there are no products here at all.
  if (listing.total === 0 && activeCount === 0 && shown.q === '') {
    return (
      <>
        {nav}
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
      {nav}

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

        {/* While a changed search or filter loads, the previous results stay and are dimmed. */}
        <div aria-busy={refreshing} className={refreshing ? 'opacity-60 transition-opacity' : ''}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted">
              {countText(listing.total)}
            </p>
            <SortSelect
              value={state.sort}
              defaultLabel={search && state.q !== '' ? 'התאמה לחיפוש' : undefined}
              onChange={(sort) => change((current) => setSort(current, sort))}
            />
          </div>

          <ActiveFilters
            query={shown}
            onRemoveBrand={(brand) => change((current) => toggleBrand(current, brand))}
            onRemoveSpec={(label, value) =>
              change((current) => toggleSpecValue(current, label, value))
            }
            onClear={clear}
          />

          {listing.products.length === 0 ? (
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
            <ProductGrid products={listing.products} headingAs="h2" eagerCount={4} />
          )}
        </div>
      </div>
    </>
  )
}
