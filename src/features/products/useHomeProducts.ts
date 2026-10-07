import { useEffect, useState } from 'react'
import { fetchRecommendedProducts, fetchSaleProducts } from '@/services/productService'
import { rememberProducts } from './productCache'
import type { Product } from './schema'

export type HomeProductsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sale: readonly Product[]; recommended: readonly Product[] }

/**
 * The two product sections of the home page, "מבצעים" and "מומלצים", each asked of the API as a
 * list of its own (the sale products, the recommended products) instead of being picked out of the
 * whole catalog. The two requests go out together, and the sections appear together.
 */
export function useHomeProducts(): HomeProductsState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; state: HomeProductsState } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      fetchSaleProducts(controller.signal),
      fetchRecommendedProducts(controller.signal),
    ]).then(
      ([sale, recommended]) => {
        rememberProducts([...sale, ...recommended])
        setResult({ attempt, state: { status: 'ready', sale, recommended } })
      },
      () => {
        if (!controller.signal.aborted) setResult({ attempt, state: { status: 'error' } })
      },
    )
    return () => controller.abort()
  }, [attempt])

  const state: HomeProductsState =
    result?.attempt === attempt ? result.state : { status: 'loading' }
  return { ...state, retry: () => setAttempt((count) => count + 1) }
}

/**
 * The recommended products alone, for a page that only suggests something to start from (the empty
 * favorites). Nothing is shown until they arrive, and nothing if they cannot be loaded.
 */
export function useRecommendedProducts(): readonly Product[] {
  const [products, setProducts] = useState<readonly Product[]>([])

  useEffect(() => {
    const controller = new AbortController()
    fetchRecommendedProducts(controller.signal).then(
      (loaded) => {
        rememberProducts(loaded)
        setProducts(loaded)
      },
      () => {
        // A suggestion, not content: without it the page is as it was.
      },
    )
    return () => controller.abort()
  }, [])

  return products
}
