import { z } from 'zod'
import { useAuthStore } from '@/features/auth/authStore'
import { deliveryDetailsSchema, type DeliveryDetails } from '@/features/checkout/delivery'
import { digest } from './checkoutAttempt'

/**
 * The delivery details a visitor had typed when the API said that their session was over, kept for a
 * moment so that signing in again does not mean typing them again.
 *
 * **When it is made.** Only when an order is sent and the API answers 401 (see `CheckoutPage`): the
 * form is about to disappear with the page, and this is the one moment it is known to be lost for a
 * reason that is not the visitor's. Nothing is saved while typing, after any other answer, or when the
 * visitor signs out (signing out removes it).
 *
 * **What is kept.** The nine delivery fields, listed one by one in `saveCheckoutDraft`: never the
 * "this is a demo" tick (it is given again, in the open, for the order that is placed), the session
 * token, the key of the order attempt, or anything else the form or the page holds. The account is kept
 * as the same short digest that `checkoutAttempt.ts` uses, not as its id. It lives in `sessionStorage`:
 * this tab only, gone when the tab is closed, never read by another tab.
 *
 * **When it is used.** Once, by the checkout of the same account, within `CHECKOUT_DRAFT_TTL_MS`. The
 * checkout removes it as soon as it opens (whether or not it could use it), so a reload, a second visit
 * or the Back button never bring it back. Another account that signs in removes it too, without
 * showing it (`startCheckoutDraftGuard`), and so does signing out.
 *
 * **When it is removed because it is old.** The age is checked on every read, and that check, not a
 * timer, is what decides whether a draft may be restored: an old draft is never used, whether or not
 * anything has removed it yet. Taking the old data out of storage is a separate, best-effort job
 * (`startCheckoutDraftGuard`): when the site opens (whoever is signed in, or nobody), when the draft is
 * made (a timer for the moment it expires), when that timer fires, and when the page becomes visible
 * again. A browser can delay a timer in a page that is hidden or suspended and does not run it in a
 * tab that is closed (closing the tab ends the storage anyway), so there is no promise that an old
 * draft is gone at the minute it expires, only that it is not used and that it is removed at the next of
 * these moments. Nothing polls.
 *
 * **What is trusted.** Nothing. Storage can be edited, so the whole record is read against a strict
 * structure (no field that is not listed), the age and the account are checked, and the details go
 * through the same rules as an order (`deliveryDetailsSchema`: `hasNonText`, the limits, the
 * normalizing). Anything that does not pass is not used, and is removed when it is found. This is a
 * convenience for the visitor, not a promise: the order that is placed from the restored form is
 * checked again by the form and, once more, by the API, like any other order.
 */
export const CHECKOUT_DRAFT_KEY = 'online-store:checkout-draft'
/** After this long the visitor has stopped; the details are no longer worth restoring (nor keeping). */
export const CHECKOUT_DRAFT_TTL_MS = 30 * 60 * 1000

const draftSchema = z.strictObject({
  version: z.literal(1),
  owner: z.string().min(1),
  savedAt: z.number().int(),
  details: z.strictObject({
    fullName: z.string(),
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    street: z.string(),
    houseNumber: z.string(),
    apartment: z.string(),
    postalCode: z.string(),
    notes: z.string(),
  }),
})

type Draft = z.infer<typeof draftSchema>

/** What is in storage, by its structure and age alone (whose it is, and whether the details pass, come next). */
type Found = { kind: 'none' | 'unusable' | 'expired' } | { kind: 'live'; draft: Draft }

type Reading =
  { kind: 'none' | 'unusable' | 'expired' | 'foreign' } | { kind: 'mine'; details: DeliveryDetails }

function inspect(now: number): Found {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(CHECKOUT_DRAFT_KEY)
  } catch {
    return { kind: 'none' }
  }
  if (raw === null) return { kind: 'none' }

  let stored: unknown
  try {
    stored = JSON.parse(raw)
  } catch {
    return { kind: 'unusable' }
  }
  const parsed = draftSchema.safeParse(stored)
  if (!parsed.success) return { kind: 'unusable' }

  const draft = parsed.data
  // A clock that went back makes an age below zero: that is not a draft made a moment ago.
  const age = now - draft.savedAt
  if (age < 0 || age >= CHECKOUT_DRAFT_TTL_MS) return { kind: 'expired' }
  return { kind: 'live', draft }
}

/** The decision to restore, made from the storage as it is now, on every read: never from a timer. */
function read(userId: string, now: number): Reading {
  const found = inspect(now)
  if (found.kind !== 'live') return { kind: found.kind }
  const { draft } = found
  if (draft.owner !== digest(userId)) return { kind: 'foreign' }

  const details = deliveryDetailsSchema.safeParse(draft.details)
  return details.success ? { kind: 'mine', details: details.data } : { kind: 'unusable' }
}

/**
 * Keeps the delivery details of `userId`'s checkout. The fields are picked one by one on purpose: the
 * object that comes from the form also holds the demo tick, and must not be stored by being spread.
 */
export function saveCheckoutDraft(
  userId: string,
  values: DeliveryDetails,
  now: number = Date.now(),
): void {
  const record = {
    version: 1,
    owner: digest(userId),
    savedAt: now,
    details: {
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      city: values.city,
      street: values.street,
      houseNumber: values.houseNumber,
      apartment: values.apartment,
      postalCode: values.postalCode,
      notes: values.notes,
    },
  }
  try {
    sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(record))
  } catch {
    // No storage (blocked, full): the visitor types the details again. Nothing is reported, because
    // the only thing to say would be the details themselves.
    return
  }
  if (guards > 0) checkForStaleDraft()
}

/**
 * The details kept for `userId`, or null: there are none, they are older than the time allowed, they
 * are another account's, or they are not what this file wrote. It only looks: whoever uses a draft
 * removes it (`forgetCheckoutDraft`), so that asking twice (a page that is drawn twice) gives the
 * same answer.
 */
export function peekCheckoutDraft(
  userId: string,
  now: number = Date.now(),
): DeliveryDetails | null {
  const reading = read(userId, now)
  return reading.kind === 'mine' ? reading.details : null
}

/** Removes whatever draft there is, usable or not. */
export function forgetCheckoutDraft(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_DRAFT_KEY)
  } catch {
    // No storage: there is nothing to remove.
  }
}

/** Removes the draft unless it is a usable one of `userId`'s: another account's, an old one, a spoilt one. */
export function discardCheckoutDraftUnlessOf(userId: string, now: number = Date.now()): void {
  if (read(userId, now).kind !== 'mine') forgetCheckoutDraft()
}

/**
 * Removes the draft if it is old, or is not what this file wrote (whoever it belongs to), and keeps a
 * draft that is still good. Returns how long that one has left, or null when there is none. It
 * decides by the clock now, so it can be called at any time and never removes a good draft.
 */
export function removeStaleCheckoutDraft(now: number = Date.now()): number | null {
  const found = inspect(now)
  if (found.kind === 'live') return CHECKOUT_DRAFT_TTL_MS - (now - found.draft.savedAt)
  if (found.kind !== 'none') forgetCheckoutDraft()
  return null
}

/** How many guards are running (the app starts one; a test may start another). */
let guards = 0
/** The one timer for the moment the draft in storage expires. It is only ever a reminder to look. */
let expiryTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Looks at the draft that is in storage now: an old one is removed, and for a good one a timer is set
 * for the moment it expires, which looks again. A timer that fires early (the clock moved, a test)
 * finds the draft still good, removes nothing and sets the timer again for what is left.
 */
function checkForStaleDraft(): void {
  clearTimeout(expiryTimer)
  expiryTimer = undefined
  const left = removeStaleCheckoutDraft()
  if (left !== null) expiryTimer = setTimeout(checkForStaleDraft, left)
}

/**
 * Keeps a draft from outliving the visitor it belongs to, and from outliving its time. Started once by
 * the layout of the whole site; returns the function that stops it.
 *
 * - Whenever an account signs in (or is signed in as the site opens), a draft that is not that
 *   account's is removed, so that it is gone before any page can show it.
 * - As the site opens, whoever is signed in (or nobody), an old draft is removed, and a good one gets
 *   its timer. The same happens when a draft is made, when the timer fires, and when the page becomes
 *   visible again, because a hidden or suspended page may have run the timer late or not at all.
 *
 * This is cleaning, not authorization: reading a draft checks its age itself (see `read`), and the
 * browser gives no promise about when a timer runs.
 */
export function startCheckoutDraftGuard(): () => void {
  guards += 1
  checkForStaleDraft()

  const sweep = (user: { id: string } | null) => {
    if (user) discardCheckoutDraftUnlessOf(user.id)
  }
  sweep(useAuthStore.getState().user)
  const stopWatchingAccounts = useAuthStore.subscribe((state, previous) => {
    if (state.user?.id !== previous.user?.id) sweep(state.user)
  })

  const lookAgainWhenShown = () => {
    if (document.visibilityState === 'visible') checkForStaleDraft()
  }
  document.addEventListener('visibilitychange', lookAgainWhenShown)

  let stopped = false
  return () => {
    // Stopping twice (a cleanup that runs again) must not count one guard out twice.
    if (stopped) return
    stopped = true
    stopWatchingAccounts()
    document.removeEventListener('visibilitychange', lookAgainWhenShown)
    guards -= 1
    if (guards === 0) {
      clearTimeout(expiryTimer)
      expiryTimer = undefined
    }
  }
}
