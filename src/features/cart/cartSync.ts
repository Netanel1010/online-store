import { useAuthStore } from '@/features/auth/authStore'
import {
  clearServerCart,
  fetchServerCart,
  removeServerLine,
  setServerLine,
  type CartOutcome,
} from './cartService.ts'
import { readCartMarker, writeCartMarker } from './cartSyncMarker.ts'
import { mergeCarts, planChanges, type CartChange } from './cartSyncPlan.ts'
import { MAX_ORDER_LINES } from './limits.ts'
import { useCartStore } from './cartStore.ts'
import { useCartSyncStatus } from './cartSyncStatus.ts'

/**
 * When the changes to the cart are sent, and when a failed attempt is repeated. An object that tests
 * change (src/test/setup.ts), like `fetchPolicy`; nothing else in the app does.
 */
export const cartSyncPolicy = {
  /** A burst of clicks (a quantity raised five times) becomes one set of requests. */
  debounceMs: 400,
  /** The pauses before the first, second, ... repeat; the last one is then used for ever. */
  retryDelaysMs: [5_000, 15_000, 45_000] as number[],
}

export const CART_SYNC_NOTICES = {
  full: `העגלה מכילה עד ${MAX_ORDER_LINES} מוצרים שונים, ולכן מוצר שלא נכנס הוסר ממנה.`,
  rejected: 'מוצר שאינו זמין עוד הוסר מהעגלה.',
  offline: 'לא הצלחנו לשמור את העגלה בחשבון. היא נשארת כאן, וננסה שוב בקרוב.',
} as const

/** What one signed-in visit of the cart knows. A new one starts with every sign-in. */
interface Session {
  token: string
  userId: string
  /**
   * What was written down about the cart in this browser before this sign-in (see cartSyncMarker.ts):
   * `null` for a cart that was filled in while signed out, with no account behind it.
   */
  origin: { owner: string; dirty: boolean } | null
  /** Whether the cart in this browser was changed since this session began. */
  changedSince: boolean
  /** What this browser has itself read from the API or written to it, line by line; `null` before the first read. */
  known: Map<string, number> | null
  running: boolean
  again: boolean
  /** The session of the account is over (the API said so): nothing more is sent. */
  halted: boolean
  failures: number
  toldOffline: boolean
  timer: ReturnType<typeof setTimeout> | undefined
}

/**
 * Keeps the cart of the signed-in account on the API in step with the cart in this browser.
 *
 * The cart in this browser stays what the pages read and change, instantly, and works offline; this
 * only mirrors it. While nobody is signed in nothing is sent, as before.
 *
 *  - Signing in: the cart of the account is read, and what the cart in this browser becomes depends
 *    on what it is. A cart filled in while signed out is joined with the account's (`mergeCarts`).
 *    A copy of this account's own cart that has changes not yet sent (a tab closed a moment after a
 *    click) is what the visitor last wanted, so it is sent. A copy that is all sent, or a cart left
 *    by another account, is replaced by the account's.
 *  - After that, every change is sent a moment later, as the quantities it ended up at (`planChanges`),
 *    so a burst of clicks is a few requests and repeating one is harmless. A failed attempt is repeated
 *    with growing pauses, and when the browser is back online.
 *  - Signing out: the cart here is emptied, so that the next person on a shared computer does not
 *    find it. The account keeps its cart.
 *
 * Changes made on another device are read at the next sign-in or load, not live.
 *
 * `notify` shows a message to the visitor. Returns a function that stops it (the cart is kept).
 */
export function startCartSync(notify: (message: string) => void): () => void {
  let session: Session | null = null

  const items = () => useCartStore.getState().items

  /** True when the cart here equals what this browser last knew the API holds. */
  function settle(s: Session) {
    if (s.known === null || planChanges(s.known, items()).length > 0) return false
    writeCartMarker({ owner: s.userId, dirty: false })
    return true
  }

  function retryLater(s: Session) {
    s.failures += 1
    if (!s.toldOffline) {
      s.toldOffline = true
      notify(CART_SYNC_NOTICES.offline)
    }
    const { retryDelaysMs } = cartSyncPolicy
    const delay = retryDelaysMs[Math.min(s.failures - 1, retryDelaysMs.length - 1)] ?? 60_000
    schedule(s, delay)
  }

  function schedule(s: Session, delayMs: number) {
    clearTimeout(s.timer)
    s.timer = setTimeout(() => void sync(s), delayMs)
  }

  /** The first read: what the cart here becomes when it meets the account's. */
  async function hydrate(s: Session): Promise<boolean> {
    const outcome = await fetchServerCart(s.token)
    if (session !== s) return false
    // Whatever the answer, the visitor has waited long enough to be shown the cart that is here.
    useCartSyncStatus.setState({ reading: false })
    if (!outcome.ok) {
      if (outcome.reason === 'unauthorized') s.halted = true
      else retryLater(s)
      return false
    }
    s.known = new Map(outcome.items.map((line) => [line.productId, line.quantity]))
    const mine = s.origin !== null && s.origin.owner === s.userId
    if (mine && (s.origin!.dirty || s.changedSince)) {
      // The last word of the visitor on this cart: what they removed stays removed too.
      writeCartMarker({ owner: s.userId, dirty: true })
      return true
    }
    // A cart filled in while signed out is joined with the account's; anything else here is only a
    // copy of the account's cart (already sent) or somebody else's, and gives way to it.
    const next = s.origin === null ? mergeCarts(outcome.items, items()) : outcome.items
    writeCartMarker({ owner: s.userId, dirty: true })
    useCartStore.setState({
      items: next.map(({ productId, quantity }) => ({ productId, quantity })),
    })
    return true
  }

  /** Sends one change. On success the API's answer to it is what this browser now knows. */
  function send(token: string, change: CartChange): Promise<CartOutcome> {
    if (change.kind === 'clear') return clearServerCart(token)
    if (change.kind === 'remove') return removeServerLine(token, change.productId)
    return setServerLine(token, change.productId, change.quantity)
  }

  function remember(known: Map<string, number>, change: CartChange) {
    if (change.kind === 'clear') known.clear()
    else if (change.kind === 'remove') known.delete(change.productId)
    else known.set(change.productId, change.quantity)
  }

  async function sync(s: Session) {
    if (s.running) {
      s.again = true
      return
    }
    s.running = true
    try {
      do {
        s.again = false
        if (session !== s || s.halted) return
        if (s.known === null && !(await hydrate(s))) return
        const [change] = planChanges(s.known!, items())
        if (!change) {
          s.failures = 0
          s.toldOffline = false
          settle(s)
          continue
        }
        const outcome = await send(s.token, change)
        if (session !== s) return
        if (outcome.ok) {
          remember(s.known!, change)
          s.failures = 0
          s.toldOffline = false
          s.again = true
        } else if (outcome.reason === 'unauthorized') {
          s.halted = true
        } else if (outcome.reason === 'unavailable') {
          retryLater(s)
          return
        } else {
          if (change.kind === 'set') {
            // A line that can never be saved must not stay in the cart, where it would be tried for ever.
            useCartStore.getState().removeItem(change.productId)
            notify(
              outcome.reason === 'cart-full' ? CART_SYNC_NOTICES.full : CART_SYNC_NOTICES.rejected,
            )
          } else {
            // Removing is not refused for a reason that could change: count it as done.
            remember(s.known!, change)
          }
          s.again = true
        }
      } while (s.again)
    } finally {
      s.running = false
    }
  }

  function begin(token: string, userId: string) {
    const s: Session = {
      token,
      userId,
      origin: readCartMarker(),
      changedSince: false,
      known: null,
      running: false,
      again: false,
      halted: false,
      failures: 0,
      toldOffline: false,
      timer: undefined,
    }
    session = s
    useCartSyncStatus.setState({ reading: true })
    void sync(s)
  }

  /**
   * Signing out (or in as somebody else): the cart here goes, so that the next person on a shared
   * computer does not find it. What was changed in the last moment and not yet sent goes with it: the
   * request that ends the session is sent at the same instant, so there is no way to send it first.
   */
  function end(s: Session) {
    session = null
    clearTimeout(s.timer)
    useCartSyncStatus.setState({ reading: false })
    useCartStore.getState().clear()
    writeCartMarker(null)
  }

  function onAuthChange() {
    const { status, token, user } = useAuthStore.getState()
    const wanted = status === 'authenticated' && token && user ? { token, userId: user.id } : null
    if (session && (wanted === null || wanted.token !== session.token)) end(session)
    if (wanted && !session) begin(wanted.token, wanted.userId)
  }

  function onCartChange() {
    const marker = readCartMarker()
    if (session) {
      session.changedSince = true
      // Before the first read nothing says whose cart this is: the marker is not touched until it does.
      if (session.known !== null) writeCartMarker({ owner: session.userId, dirty: true })
      schedule(session, cartSyncPolicy.debounceMs)
    } else if (marker && !marker.dirty) {
      // Signed out, with the copy of an account's cart still here: it is no longer only a copy.
      writeCartMarker({ ...marker, dirty: true })
    }
  }

  function onOnline() {
    if (session && !session.halted) {
      session.failures = 0
      schedule(session, 0)
    }
  }

  const stopCart = useCartStore.subscribe((state, previous) => {
    if (state.items !== previous.items) onCartChange()
  })
  const stopAuth = useAuthStore.subscribe(onAuthChange)
  window.addEventListener('online', onOnline)
  onAuthChange()

  return () => {
    stopCart()
    stopAuth()
    window.removeEventListener('online', onOnline)
    if (session) clearTimeout(session.timer)
    session = null
    useCartSyncStatus.setState({ reading: false })
  }
}
