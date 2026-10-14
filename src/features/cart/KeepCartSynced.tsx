import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { useToast } from '@/features/notifications/toastContext'
import { startCartSync } from './cartSync'
import { CART_TAB_NOTICE, startCartTabSync } from './cartTabSync'

/** The pages where the cart is on the screen, and where a change that nobody made here is worth saying. */
const PAGES_THAT_SHOW_THE_CART: readonly string[] = [paths.cart, paths.checkout]

/** Several changes in a row in the other tab (three products added one after another) are told once. */
const NOTICE_INTERVAL_MS = 3000

/**
 * Keeps the cart of the signed-in account on the API in step with the cart in this browser (see
 * `startCartSync`), keeps the cart of this tab in step with the other tabs (see `startCartTabSync`),
 * and tells the visitor when something about their cart needs saying. Renders nothing; the layout of
 * the whole site mounts it once.
 */
export function KeepCartSynced() {
  const toast = useToast()
  const { pathname } = useLocation()
  const onCartPage = PAGES_THAT_SHOW_THE_CART.includes(pathname.replace(/\/+$/, '') || '/')
  const onCartPageNow = useRef(onCartPage)
  useEffect(() => {
    onCartPageNow.current = onCartPage
  }, [onCartPage])

  useEffect(() => startCartSync((message) => toast.show({ message })), [toast])

  // The cart of this tab follows the one the browser keeps when another tab changes it. The visitor is
  // told only on a page that shows the cart, and only for a change that was actually taken from
  // another tab: a change made in this tab never comes through here.
  useEffect(() => {
    let toldAt = Number.NEGATIVE_INFINITY
    return startCartTabSync(() => {
      const now = Date.now()
      if (!onCartPageNow.current || now - toldAt < NOTICE_INTERVAL_MS) return
      toldAt = now
      toast.show({ message: CART_TAB_NOTICE })
    })
  }, [toast])
  return null
}
