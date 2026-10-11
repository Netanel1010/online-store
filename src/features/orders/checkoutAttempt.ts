import { z } from 'zod'
import type { CartItem } from '@/features/cart/cartStore'
import type { DeliveryDetails } from '@/features/checkout/delivery'

/**
 * The Idempotency-Key of the order being placed, kept in localStorage so that it survives what
 * happens around a slow API: a reload, a closed tab, a request that timed out while the order was
 * in fact placed. Sending the same order again with the same key gives the visitor the order that
 * exists instead of a second one.
 *
 * The key belongs to what is being ordered: the account, the products with their quantities, and
 * the delivery details. Anything else is a different order and gets a key of its own, so a key is
 * never used for two different orders (which the API would refuse). It is forgotten once the order
 * is placed, so the next order is a new one, and after a day, as nobody retries after that long.
 *
 * An attempt also remembers when a request was sent and the page has not heard a definite answer
 * ("pending"). That is the case after a lost answer, a timeout, a reload or leaving the page while the
 * request was on its way: the order may exist. A pending attempt is what lets the checkout ask the API
 * about that order before it sends a different one (see `submitOrder.ts`), instead of making a second
 * order because the visitor corrected a detail.
 *
 * What is kept is a short digest of the order, never the order: the name, the phone number and the
 * address stay out of storage. The digest is only compared for equality (it is not a secret and not
 * a defence: it only keeps the details from being readable there), so a plain 53-bit hash is enough.
 * If two different orders ever shared one, the API would refuse the second with idempotency_key_reuse
 * and the checkout would start again with a new key.
 */
const STORAGE_KEY = 'online-store:checkout-attempt'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const storedSchema = z.object({
  key: z.string().min(16),
  fingerprint: z.string().min(1),
  createdAt: z.number().int(),
  /** When the last request with this key was sent or lost; absent once the API has answered for sure. */
  pendingSince: z.number().int().optional(),
})

type Stored = z.infer<typeof storedSchema>

export interface PendingAttempt {
  key: string
  fingerprint: string
  /** When the request with this key was last sent, or its answer last lost. */
  since: number
}

/** cyrb53: a small, fast, well-spread 53-bit hash of a text, as a short string. */
function digest(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

export function fingerprintOf(
  userId: string,
  items: readonly CartItem[],
  delivery: DeliveryDetails,
) {
  const sorted = items
    .map(({ productId, quantity }) => ({ productId, quantity }))
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
  return digest(JSON.stringify({ userId, items: sorted, delivery }))
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    // Stored data is untrusted (it can be edited or corrupted): validate, never spread it in.
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * The key for this order: the one kept from an earlier attempt at exactly this order, or a new one
 * (which is kept). Without storage a new key is made every time, which is still safe: it only means
 * that a retry after a reload may place the order again.
 */
export function idempotencyKeyFor(
  userId: string,
  items: readonly CartItem[],
  delivery: DeliveryDetails,
  now: number = Date.now(),
): string {
  const fingerprint = fingerprintOf(userId, items, delivery)
  const kept = read()
  if (kept && kept.fingerprint === fingerprint && now - kept.createdAt < MAX_AGE_MS) {
    return kept.key
  }
  const key = crypto.randomUUID()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key, fingerprint, createdAt: now }))
  } catch {
    // No storage (private mode, full): the key just is not kept.
  }
  return key
}

function write(attempt: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
  } catch {
    // No storage (private mode, full): the attempt is just not kept.
  }
}

/**
 * The attempt whose outcome is not known, if there is one: a request was sent with its key and no
 * definite answer came back. Older than a day it is forgotten, like the key itself.
 */
export function readPendingAttempt(now: number = Date.now()): PendingAttempt | null {
  const kept = read()
  if (!kept || kept.pendingSince === undefined || now - kept.createdAt >= MAX_AGE_MS) return null
  return { key: kept.key, fingerprint: kept.fingerprint, since: kept.pendingSince }
}

/**
 * Notes that a request with the kept key is on its way, or that its answer was lost. Called again
 * when the answer is lost so that `since` is the last moment the API could have been working on it.
 */
export function markAttemptPending(now: number = Date.now()): void {
  const kept = read()
  if (kept) write({ ...kept, pendingSince: now })
}

/** Notes that the API answered for sure that no order was made: the key stays, nothing is pending. */
export function markAttemptSettled(): void {
  const kept = read()
  if (kept?.pendingSince === undefined) return
  write({ key: kept.key, fingerprint: kept.fingerprint, createdAt: kept.createdAt })
}

/** Forgets the key: the order was placed, or the key cannot be used any more. */
export function forgetCheckoutAttempt(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to forget.
  }
}
