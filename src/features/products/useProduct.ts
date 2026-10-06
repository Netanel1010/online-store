import { useEffect, useState } from 'react'
import { fetchProduct } from '@/services/productService'
import type { Product } from './schema'

export type ProductState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'not-found' }
  | { status: 'ready'; product: Product }

/**
 * One product, loaded from the API when the page for it opens. The answer is stored with the id
 * (and the retry count) it belongs to, so moving to another product shows the loading state
 * straight away instead of the previous product, and an answer that arrives late is ignored.
 */
export function useProduct(id: string | undefined): ProductState & { retry: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; state: ProductState } | null>(null)
  const key = `${id}#${attempt}`

  useEffect(() => {
    if (id === undefined) return
    const controller = new AbortController()
    fetchProduct(id, controller.signal).then(
      (product) =>
        setResult({
          key,
          state: product ? { status: 'ready', product } : { status: 'not-found' },
        }),
      () => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'error' } })
      },
    )
    return () => controller.abort()
  }, [id, key])

  const state: ProductState =
    id === undefined
      ? { status: 'not-found' }
      : result?.key === key
        ? result.state
        : { status: 'loading' }

  return { ...state, retry: () => setAttempt((count) => count + 1) }
}
