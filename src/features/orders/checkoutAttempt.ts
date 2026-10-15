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
 * **Each account keeps its own unresolved attempt.** Another account signing in on the same browser
 * must not take the key away from the first: that order may still be made on the server, and coming
 * back to the first account with a new key would place it twice. So the attempts are kept side by
 * side, one per account, and an account only ever sends its own key.
 *
 * A key is kept until its attempt is resolved: the order was placed, the visitor chose to place a
 * separate order, or a day has passed (nobody retries after that long). A refusal such as a changed
 * price or an unavailable product does not resolve it: an earlier request that is still on its way
 * could place the order after it.
 *
 * What is kept is each key with a short digest of its account and a time, never the order or the
 * account: the name, the phone number, the address and the account id stay out of storage. The
 * digest is only compared for equality (it is not a secret and not a defence: it only keeps the id
 * from being readable there), so a plain 53-bit hash is enough.
 */
const STORAGE_KEY = 'online-store:checkout-attempt'
const MAX_AGE_MS = 24 * 60 * 60 * 1000
/** More accounts than this on one browser within a day is not a person; the oldest attempts go first. */
const MAX_ATTEMPTS = 10

const attemptSchema = z.object({
  key: z.string().min(16),
  createdAt: z.number().int(),
})
/** The stored value: the unresolved attempts by the digest of their account. */
const storedSchema = z.object({ attempts: z.record(z.string().min(1), attemptSchema) })
type Attempt = z.infer<typeof attemptSchema>
type Attempts = Record<string, Attempt>

/**
 * The attempts as this page knows them. localStorage is the source of truth, so that a reload,
 * another tab and a later visit see the same keys; this copy is only used when storage cannot be
 * used (private mode, blocked), so that a retry in the same tab still carries the same key.
 */
let remembered: Attempts = {}
/**
 * Writing to storage failed the last time: storage is then behind this page, whether it is empty or
 * still holds an older copy, and `remembered` is what to go by until a write works again.
 */
let storageRefusedWrite = false

/**
 * cyrb53: a small, fast, well-spread 53-bit hash of a text, as a short string. Exported for the
 * checkout draft (`checkoutDraft.ts`), which binds itself to an account the same way.
 */
export function digest(text: string): string {
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

function readAll(): Attempts {
  // A write was refused: this page's copy has what storage was not given (a new key, or a forgotten
  // one), so it is newer than whatever storage still holds, valid or not. Reading storage instead
  // would lose a key that was just made, or bring back one that was forgotten.
  if (storageRefusedWrite) return remembered
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    // Stored data is untrusted (it can be edited or corrupted): validate, never spread it in.
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    return parsed.success ? Object.fromEntries(Object.entries(parsed.data.attempts)) : {}
  } catch {
    // Storage cannot be read: what this page remembers is all there is.
    return remembered
  }
}

function writeAll(attempts: Attempts): void {
  remembered = attempts
  try {
    if (Object.keys(attempts).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts }))
    storageRefusedWrite = false
  } catch {
    // No storage (private mode, full): the keys are only kept by this page.
    storageRefusedWrite = true
  }
}

const isLive = (attempt: Attempt, now: number) => now - attempt.createdAt < MAX_AGE_MS

/** The attempt of this account that is still unresolved, if there is one. */
function current(userId: string, now: number): Attempt | null {
  const attempt = readAll()[digest(userId)]
  return attempt && isLive(attempt, now) ? attempt : null
}

/**
 * The key of this account's unresolved attempt, or null when there is none (its last order was
 * placed, or nothing was ever sent). It makes nothing and keeps nothing: it only asks.
 */
export function unresolvedAttemptKey(userId: string, now: number = Date.now()): string | null {
  return current(userId, now)?.key ?? null
}

/**
 * The key for the next request of this account's order: the one of its unresolved attempt, or a new
 * one (which is kept next to the keys of the other accounts). Whatever the cart or the delivery
 * details are now, an unresolved attempt keeps its key. Without any storage the key is still kept
 * by this page, which is the most that can be done: a reload there can place the order again.
 */
export function idempotencyKeyFor(userId: string, now: number = Date.now()): string {
  const kept = current(userId, now)
  if (kept) return kept.key
  const live = Object.entries(readAll()).filter(([, attempt]) => isLive(attempt, now))
  // The new attempt is the newest, so it is always among those kept.
  live.push([digest(userId), { key: crypto.randomUUID(), createdAt: now }])
  const newest = live.sort(([, a], [, b]) => b.createdAt - a.createdAt).slice(0, MAX_ATTEMPTS)
  const attempts = Object.fromEntries(newest)
  writeAll(attempts)
  return attempts[digest(userId)]!.key
}

/**
 * Forgets the key of this account's attempt: its order was placed, or the visitor chose to place a
 * separate one. The attempts of the other accounts are left as they are.
 */
export function forgetCheckoutAttempt(userId: string): void {
  const attempts = readAll()
  const owner = digest(userId)
  if (!(owner in attempts)) return
  delete attempts[owner]
  writeAll(attempts)
}

/** Forgets every account's attempt. For tests: nothing in the app resolves an attempt it does not own. */
export function forgetAllCheckoutAttempts(): void {
  remembered = {}
  storageRefusedWrite = false
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to forget.
  }
}
