import { useEffect, useMemo, useState } from 'react'
import { fetchProductsByIds } from '@/services/productService'
import { rememberProducts } from './productCache'
import type { Product } from './schema'

export type ProductsByIdsState =
  | { status: 'loading' }
  | { status: 'error' }
  /** The products found, in the order of the ids that were asked for. An id with no product is left out. */
  | { status: 'ready'; products: readonly Product[] }

/**
 * The products with these ids, from the API: what the cart, the favorites, the checkout and an
 * order need, instead of the whole catalog. The page that uses it asks when it opens, so what it
 * shows is current.
 *
 * Only ids that have not been asked for yet are asked for, so taking a line out of the cart asks
 * for nothing, and an id that is added while the page is open is asked for alone. While those are
 * on their way the products already known stay on screen. Asking again after an error is `retry`.
 */
export function useProductsByIds(ids: readonly string[]): ProductsByIdsState & {
  retry: () => void
} {
  // What the API said, by id: the product, or null for "there is no such product".
  const [known, setKnown] = useState<ReadonlyMap<string, Product | null>>(new Map())
  const [failed, setFailed] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // One string stands for the whole list, so that a new array with the same ids asks for nothing.
  const key = useMemo(() => [...new Set(ids)].join('\n'), [ids])
  const unknown = useMemo(
    () => (key === '' ? [] : key.split('\n').filter((id) => !known.has(id))),
    [key, known],
  )
  const wanted = unknown.join('\n')

  useEffect(() => {
    if (wanted === '') return
    const controller = new AbortController()
    const asked = wanted.split('\n')
    fetchProductsByIds(asked, controller.signal).then(
      (products) => {
        rememberProducts(products)
        const byId = new Map(products.map((product) => [product.id, product]))
        setFailed(null)
        setKnown((current) => {
          const next = new Map(current)
          for (const id of asked) next.set(id, byId.get(id) ?? null)
          return next
        })
      },
      () => {
        if (!controller.signal.aborted) setFailed(`${wanted}#${attempt}`)
      },
    )
    return () => controller.abort()
  }, [wanted, attempt])

  const retry = () => setAttempt((count) => count + 1)

  if (key === '') return { status: 'ready', products: [], retry }
  const products = key.split('\n').flatMap((id) => {
    const product = known.get(id)
    return product ? [product] : []
  })
  if (unknown.length === 0) return { status: 'ready', products, retry }
  if (failed === `${wanted}#${attempt}`) return { status: 'error', retry }
  // Something is on its way: show what is already known, or "loading" if nothing is.
  return known.size > 0 ? { status: 'ready', products, retry } : { status: 'loading', retry }
}
