import { z } from 'zod'

/**
 * The Idempotency-Key of the order being placed, kept in localStorage so that it survives what
 * happens around a slow API: a reload, a closed tab, a request that timed out while the order was
 * in fact placed. Sending the order again with the same key gives the visitor the order that exists
 * instead of a second one.
 *
 * The key belongs to an **unresolved attempt of an account**, not to what was typed. After an answer
 * is lost the visitor may change the delivery details or the cart, and an attempt is the same attempt
 * all the same: the next request carries the same key, and the API, which knows whether it made an
 * order, decides. If it made none, the request (edited or not) simply places the order, so an edit
 * is never lost; if it made one, it says so (`409 idempotency_key_reuse` with the order number, or
 * `POST /api/orders/lookup`), and the visitor is shown that order instead of getting another. Were the
 * key tied to the details, an edit would mint a new key and could place a second order.
 *
 * The key is kept until the attempt is resolved: the order was placed, the visitor chose to place a
 * separate order, or a day has passed (nobody retries after that long). A refusal such as a changed
 * price or an unavailable product does not resolve it: an earlier request that is still on its way
 * could place the order after it.
 *
 * What is kept is the key, a short digest of the account and the time, never the order or the
 * account: the name, the phone number, the address and the account id stay out of storage. The
 * digest is only compared for equality (it is not a secret and not a defence: it only keeps the id
 * from being readable there), so a plain 53-bit hash is enough. A key found for another account is
 * not used.
 */
const STORAGE_KEY = 'online-store:checkout-attempt'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const storedSchema = z.object({
  key: z.string().min(16),
  owner: z.string().min(1),
  createdAt: z.number().int(),
})
type Attempt = z.infer<typeof storedSchema>

/**
 * The attempt as this page knows it. localStorage is the source of truth, so that a reload, another
 * tab and a later visit see the same key; this copy is only used when storage cannot be read at all
 * (private mode, blocked), so that a retry in the same tab still carries the same key.
 */
let remembered: Attempt | null = null
/** Writing to storage failed the last time: an empty storage then says nothing about the attempt. */
let storageRefusedWrite = false

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

function read(): Attempt | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return storageRefusedWrite ? remembered : null
    // Stored data is untrusted (it can be edited or corrupted): validate, never spread it in.
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    // Storage cannot be read: what this page remembers is all there is.
    return remembered
  }
}

/** The attempt of this account that is still unresolved, if there is one. */
function current(userId: string, now: number): Attempt | null {
  const kept = read()
  if (kept && kept.owner === digest(userId) && now - kept.createdAt < MAX_AGE_MS) return kept
  return null
}

/**
 * The key of this account's unresolved attempt, or null when there is none (the last order was
 * placed, or nothing was ever sent). It makes nothing and keeps nothing: it only asks.
 */
export function unresolvedAttemptKey(userId: string, now: number = Date.now()): string | null {
  return current(userId, now)?.key ?? null
}

/**
 * The key for the next request of this account's order: the one of its unresolved attempt, or a new
 * one (which is kept). Whatever the cart or the delivery details are now, an unresolved attempt
 * keeps its key. Without any storage the key is still kept by this page, which is the most that can
 * be done: a reload there can place the order again.
 */
export function idempotencyKeyFor(userId: string, now: number = Date.now()): string {
  const kept = current(userId, now)
  if (kept) return kept.key
  const attempt: Attempt = { key: crypto.randomUUID(), owner: digest(userId), createdAt: now }
  remembered = attempt
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attempt))
    storageRefusedWrite = false
  } catch {
    // No storage (private mode, full): the key is only kept by this page.
    storageRefusedWrite = true
  }
  return attempt.key
}

/** Forgets the key: the attempt is resolved, so the next order is a new one. */
export function forgetCheckoutAttempt(): void {
  remembered = null
  storageRefusedWrite = false
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to forget.
  }
}
