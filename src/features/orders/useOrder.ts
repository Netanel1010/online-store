import { useEffect, useState } from 'react'
import { useAuthStore } from '@/features/auth/authStore'
import { fetchOrder } from './orderService'
import type { Order } from './orderSchema'

export type OrderView =
  | { status: 'loading' }
  | { status: 'ready'; order: Order }
  /** No such order in this account (it does not exist, or it is somebody else's). */
  | { status: 'not-found' }
  /** The API could not be asked, or failed: nothing is known about the order. */
  | { status: 'unavailable' }

/**
 * One of the signed-in account's orders, read from the API. The order is never taken from the
 * address or the router's state, so it opens the same after a reload, in another tab, or from a
 * link. If the API says the session is over, the visitor is signed out here too, which sends them
 * to the login page and back.
 */
export function useOrder(orderNumber: string): { view: OrderView; retry: () => void } {
  const token = useAuthStore((state) => state.token)
  const [attempt, setAttempt] = useState(0)
  const request = `${orderNumber}#${attempt}`
  const [answer, setAnswer] = useState<{ request: string; view: OrderView } | null>(null)

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    fetchOrder(token, orderNumber, controller.signal)
      .then((outcome) => {
        if (controller.signal.aborted) return
        if (outcome.status === 'unauthorized') {
          useAuthStore.getState().logout()
          return
        }
        setAnswer({
          request,
          view: outcome.status === 'ok' ? { status: 'ready', order: outcome.order } : outcome,
        })
      })
      .catch(() => {
        // Only a request the page cancelled by being left rejects; nobody is waiting for it.
      })
    return () => controller.abort()
  }, [token, orderNumber, request])

  const view: OrderView = answer?.request === request ? answer.view : { status: 'loading' }
  return { view, retry: () => setAttempt((count) => count + 1) }
}
