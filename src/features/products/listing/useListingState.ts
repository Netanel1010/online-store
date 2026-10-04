import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { parseListingState, serializeListingState, type ListingState } from './query'

/**
 * The listing state lives in the URL. This hook parses it on every render and writes changes
 * back with a new history entry, so the browser's back and forward buttons step through the
 * visitor's filter and sort changes and a copied URL reproduces the view.
 *
 * `search: false` is for pages without a search box: any `q` in the URL is ignored there.
 */
export function useListingState({ search }: { search: boolean }) {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => parseListingState(params, { search }), [params, search])

  const update = useCallback(
    (change: (state: ListingState) => ListingState) => {
      setParams((previous) =>
        serializeListingState(change(parseListingState(previous, { search })), { search }),
      )
    },
    [setParams, search],
  )

  return { state, update }
}
