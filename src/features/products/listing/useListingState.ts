import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { parseListingState, serializeListingState, type ListingState } from './query'

/**
 * The listing state lives in the URL. This hook parses it on every render and writes changes
 * back with a new history entry, so the browser's back and forward buttons step through the
 * visitor's filter and sort changes and a copied URL reproduces the view.
 *
 * `search: false` is for pages without a search box: any `q` in the URL is ignored there.
 *
 * `sanitize` drops the parts of the URL the page has no use for (the listing ignores specification
 * filters on pages that have none). It is applied to what the page reads and to what is written
 * back, so such a parameter never takes effect and disappears from the URL on the next change.
 */
export function useListingState({
  search,
  sanitize = (state) => state,
}: {
  search: boolean
  sanitize?: (state: ListingState) => ListingState
}) {
  const [params, setParams] = useSearchParams()
  const { key } = useLocation()
  const state = useMemo(
    () => sanitize(parseListingState(params, { search })),
    [params, search, sanitize],
  )

  // The router applies a navigation a moment after it is requested (it is a low-priority
  // update). If a second change arrives in that gap, for example a quick second click on a slow
  // device, building it from the last rendered URL would silently drop the first change. So the
  // URL we have just written is remembered until the router has rendered a new location.
  const written = useRef<URLSearchParams | null>(null)
  useEffect(() => {
    written.current = null
  }, [key])

  const update = useCallback(
    (change: (state: ListingState) => ListingState) => {
      setParams((rendered) => {
        const current = parseListingState(written.current ?? rendered, { search })
        const next = serializeListingState(change(sanitize(current)), { search })
        written.current = next
        return next
      })
    },
    [setParams, search, sanitize],
  )

  return { state, update }
}
