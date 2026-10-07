import { useEffect, useSyncExternalStore } from 'react'
import { fetchCategoryCounts } from '@/services/productService'
import type { CategoryId } from './categories'

/**
 * How many products each category has, for the category links of the product pages. The counts
 * change only when the catalog does, so they are asked for once and kept for the visit: moving from
 * one category to another shows the links at once. Until they arrive (or if they cannot be loaded)
 * the links are simply not shown; they are a way around the site, not content.
 */
type Counts = ReadonlyMap<CategoryId, number> | null

let counts: Counts = null
let inFlight = false
const listeners = new Set<() => void>()

function load() {
  if (inFlight || counts !== null) return
  inFlight = true
  fetchCategoryCounts()
    .then((loaded) => {
      counts = loaded
      listeners.forEach((listener) => listener())
    })
    .catch(() => {
      // Asked again by the next page that wants them.
    })
    .finally(() => {
      inFlight = false
    })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useCategoryCounts(): Counts {
  const current = useSyncExternalStore(
    subscribe,
    () => counts,
    () => null,
  )
  useEffect(load, [])
  return current
}

/** Test helper: forget the counts. */
export function resetCategoryCounts() {
  counts = null
  inFlight = false
}
