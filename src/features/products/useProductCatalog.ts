import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { fetchProducts } from '@/services/productService'
import type { Product } from './schema'

export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'ready'; products: readonly Product[] }

/**
 * The catalog is loaded once and shared by every page, so navigating between routes does
 * not refetch or flash a loading state. A small external store keeps that state outside
 * React without pulling in a data-fetching library.
 */
let state: CatalogState = { status: 'loading' }
let inFlight = false
const listeners = new Set<() => void>()

function setState(next: CatalogState) {
  state = next
  listeners.forEach((listener) => listener())
}

function load() {
  if (inFlight) return
  inFlight = true
  setState({ status: 'loading' })
  fetchProducts()
    .then((products) => setState({ status: 'ready', products }))
    .catch((error: unknown) =>
      setState({
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      }),
    )
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

const getSnapshot = () => state

/** Test helper: forget any loaded data. */
export function resetProductCatalog() {
  state = { status: 'loading' }
  inFlight = false
}

/** The products if the catalog has loaded, otherwise null. Reads only: it never starts a load. */
export function useLoadedCatalog(): readonly Product[] | null {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return current.status === 'ready' ? current.products : null
}

export function useProductCatalog(): CatalogState & { retry: () => void } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (state.status === 'loading') load()
  }, [])

  const retry = useCallback(() => {
    load()
  }, [])

  return { ...current, retry }
}
