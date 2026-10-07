import { z } from 'zod'

/**
 * Remembers, next to the cart kept in this browser, whose cart it is a copy of and whether it has
 * changes the API has not yet been given. It is how a sign-in knows what to do with the cart it finds
 * here (see `cartSync.ts`): send it, or replace it with the account's.
 *
 * It is not the cart (no products are in it) and not a secret (only an account id). It is read as
 * untrusted: anything that does not match is the same as nothing.
 */
const KEY = 'online-store:cart-sync'

const markerSchema = z.object({ owner: z.string().min(1), dirty: z.boolean() })

export type CartMarker = z.infer<typeof markerSchema>

export function readCartMarker(): CartMarker | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return null
    const parsed = markerSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** `null` forgets it. Storage that is unavailable (private mode) is not an error: nothing is kept. */
export function writeCartMarker(marker: CartMarker | null) {
  try {
    if (marker === null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(marker))
  } catch {
    // Nothing to keep it in: the next sign-in joins the carts, which loses nothing.
  }
}
