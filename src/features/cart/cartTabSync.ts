import { adoptStoredCart, CART_STORAGE_KEY } from './cartStore.ts'

/**
 * Keeps the cart of this tab the cart of the browser: when another tab changes it, this tab takes the
 * change at once, so the badge, the cart page and the checkout show what the browser keeps and not what
 * this tab saw when it opened.
 *
 *  - Another tab's change arrives as a `storage` event (the browser sends it to every other tab of
 *    the site, never to the tab that wrote). Only the cart's key is looked at, and only in
 *    localStorage.
 *  - A tab that was hidden, frozen or restored from the back-forward cache may have missed events, so
 *    it reads the cart again when it is shown (`visibilitychange`, `pageshow`).
 *  - What is stored is read like anything else from storage: what is not a cart changes nothing.
 *
 * Taking the cart writes it back to storage unchanged, which the browser does not announce, so two
 * tabs do not answer one another in a loop. If two tabs change the same line at the same moment, the
 * later write wins (see `readStoredCart`).
 *
 * `onTaken` is called each time a change from another tab was actually taken, never for a change this
 * tab made itself. Returns a function that stops listening.
 */
export function startCartTabSync(onTaken?: () => void): () => void {
  const take = () => {
    if (adoptStoredCart()) onTaken?.()
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== CART_STORAGE_KEY || event.storageArea !== localStorage) return
    take()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') take()
  }
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) take()
  }

  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onPageShow)
  return () => {
    window.removeEventListener('storage', onStorage)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onPageShow)
  }
}
