import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { parseListingState, serializeListingState, type ListingState } from './query'

/**
 * The listing state lives in the URL. This hook parses it on every render and writes changes
 * back with a new history entry, so the browser's back and forward buttons step through the
 * visitor's filter and sort changes and a copied URL reproduces the view.
 *
 * `search: false` is for pages without a search box: any `q` in the URL is ignored there.
 *
 * `sanitize` removes parts of the URL that do not exist in the catalog (see
 * `sanitizeSpecFilters`). It is applied to what the page shows and to what is written back, so
 * an invalid parameter never filters anything and disappears from the URL on the next change.
 */
export function useListingState({
  search,
  sanitize = (state) => state,
}: {
  search: boolean
  sanitize?: (state: ListingState) => ListingState
}) {
  const [params, setParams] = useSearchParams()
  const state = useMemo(
    () => sanitize(parseListingState(params, { search })),
    [params, search, sanitize],
  )

  const update = useCallback(
    (change: (state: ListingState) => ListingState) => {
      setParams((previous) =>
        serializeListingState(change(sanitize(parseListingState(previous, { search }))), {
          search,
        }),
      )
    },
    [setParams, search, sanitize],
  )

  return { state, update }
}
