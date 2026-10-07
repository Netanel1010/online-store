import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/features/auth/authStore'
import { fetchOrders } from './orderService'
import type { Order } from './orderSchema'

export type OrdersView =
  | { status: 'loading' }
  | {
      status: 'ready'
      /** The account's orders in the order the API gave them: the newest first. */
      orders: Order[]
      /** How many orders the account has in all (more than are listed while there is more to load). */
      total: number
      hasMore: boolean
      loadingMore: boolean
      /** The last attempt to load more failed: the orders shown are still right. */
      moreFailed: boolean
    }
  /** The API could not be asked, or failed: nothing is known about the orders. */
  | { status: 'unavailable' }

interface Loaded {
  orders: Order[]
  total: number
  nextPage: number | null
}

/**
 * The signed-in account's orders, read from the API a page at a time. The order is the API's (the
 * newest first) and is never changed here. If the API says the session is over, the visitor is signed
 * out here too, which sends them to the login page and back.
 */
export function useOrders(): { view: OrdersView; loadMore: () => void; retry: () => void } {
  const token = useAuthStore((state) => state.token)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'unavailable' }
    | (Loaded & { status: 'ready'; loadingMore: boolean; moreFailed: boolean })
  >({ status: 'loading' })
  const more = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    fetchOrders(token, 1, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return
        if (outcome.status === 'unauthorized') {
          useAuthStore.getState().logout()
        } else if (outcome.status === 'unavailable') {
          setState({ status: 'unavailable' })
        } else {
          const { items, page, total, totalPages } = outcome.page
          setState({
            status: 'ready',
            orders: items,
            total,
            nextPage: page < totalPages ? page + 1 : null,
            loadingMore: false,
            moreFailed: false,
          })
        }
      })
      .catch(() => {
        // Only a request the page cancelled by being left rejects; nobody is waiting for it.
      })
    return () => {
      controller.abort()
      more.current?.abort()
    }
  }, [token, attempt])

  const loadMore = useCallback(() => {
    if (!token || state.status !== 'ready' || state.nextPage === null || state.loadingMore) return
    const page = state.nextPage
    const controller = new AbortController()
    more.current = controller
    setState({ ...state, loadingMore: true, moreFailed: false })
    fetchOrders(token, page, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return
        if (outcome.status === 'unauthorized') {
          useAuthStore.getState().logout()
        } else if (outcome.status === 'unavailable') {
          setState((current) =>
            current.status === 'ready'
              ? { ...current, loadingMore: false, moreFailed: true }
              : current,
          )
        } else {
          const { items, page: loadedPage, totalPages, total } = outcome.page
          setState((current) => {
            if (current.status !== 'ready') return current
            // An order placed meanwhile moves the others down a page: never list one twice.
            const known = new Set(current.orders.map((order) => order.orderNumber))
            return {
              status: 'ready',
              orders: [
                ...current.orders,
                ...items.filter((order) => !known.has(order.orderNumber)),
              ],
              total,
              nextPage: loadedPage < totalPages ? loadedPage + 1 : null,
              loadingMore: false,
              moreFailed: false,
            }
          })
        }
      })
      .catch(() => {
        // Left the page while loading: nobody is waiting for it.
      })
  }, [token, state])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  const view: OrdersView =
    state.status === 'ready'
      ? {
          status: 'ready',
          orders: state.orders,
          total: state.total,
          hasMore: state.nextPage !== null,
          loadingMore: state.loadingMore,
          moreFailed: state.moreFailed,
        }
      : state
  return { view, loadMore, retry }
}
