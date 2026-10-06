import { useEffect, useRef, useState } from 'react'
import {
  fetchProductListing,
  listingPath,
  type ListingRequest,
  type ProductListing,
} from '@/services/productService'

export type ProductListingState =
  | { status: 'loading' }
  | { status: 'error' }
  /** `refreshing`: `listing` is the answer to the previous request, and a new one is loading. */
  | { status: 'ready'; listing: ProductListing; refreshing: boolean }

interface Settled {
  /** The request this answer belongs to. */
  key: string
  outcome: { ok: true; listing: ProductListing } | { ok: false }
}

/**
 * The products of a listing, asked of the API whenever the request (search text, filters, sort)
 * changes. The answer is stored with the request it belongs to, so one that arrives late is
 * ignored, and a request that is no longer needed is cancelled.
 *
 * While a changed request loads, the previous listing stays on screen (`refreshing`) instead of
 * being replaced by a skeleton: the filter panel the visitor just clicked in must not disappear
 * under their keyboard focus, and the page must not jump with every click. Only the first request
 * of a listing, and a failed one, show something else.
 */
export function useProductListing(request: ListingRequest): ProductListingState & {
  retry: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled | null>(null)
  const [lastListing, setLastListing] = useState<ProductListing | null>(null)
  const key = `${listingPath(request, 1, true)}#${attempt}`

  // The effect below runs for a new key only, but it needs the request the key stands for.
  const latest = useRef(request)
  useEffect(() => {
    latest.current = request
  })

  useEffect(() => {
    const controller = new AbortController()
    fetchProductListing(latest.current, controller.signal).then(
      (listing) => {
        setSettled({ key, outcome: { ok: true, listing } })
        setLastListing(listing)
      },
      () => {
        if (!controller.signal.aborted) setSettled({ key, outcome: { ok: false } })
      },
    )
    return () => controller.abort()
  }, [key])

  const state: ProductListingState =
    settled?.key === key
      ? settled.outcome.ok
        ? { status: 'ready', listing: settled.outcome.listing, refreshing: false }
        : { status: 'error' }
      : lastListing
        ? { status: 'ready', listing: lastListing, refreshing: true }
        : { status: 'loading' }

  return { ...state, retry: () => setAttempt((count) => count + 1) }
}
