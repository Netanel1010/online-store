import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import { MAX_QUANTITY } from './limits.ts'

export { MAX_QUANTITY }

export interface CartItem {
  productId: string
  quantity: number
}

interface CartState {
  items: CartItem[]
  /** Adds `quantity` of a product, merging with an existing line. Capped at MAX_QUANTITY. */
  addItem: (productId: string, quantity?: number) => void
  /** Sets a line's quantity, clamped to 1..MAX_QUANTITY. Use removeItem to delete a line. */
  setQuantity: (productId: string, quantity: number) => void
  removeItem: (productId: string) => void
  /** Drops lines whose product no longer exists in the catalog. */
  retainOnly: (validIds: ReadonlySet<string>) => void
  clear: () => void
}

function clampQuantity(quantity: number) {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(quantity)))
}

/**
 * Only product ids and quantities are persisted. Names, images and prices are always read from
 * the catalog, so a cart can never show a stale price.
 *
 * This is the cart the pages read and change, kept in this browser. For a signed-in visitor it is
 * mirrored to the account's cart on the API (see `cartSync.ts`), which this store knows nothing about.
 */
const persistedCartSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(MAX_QUANTITY),
    }),
  ),
})

function mergeDuplicates(items: readonly CartItem[]): CartItem[] {
  const merged = new Map<string, number>()
  for (const { productId, quantity } of items) {
    merged.set(productId, clampQuantity((merged.get(productId) ?? 0) + quantity))
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }))
}

/** Where the cart is kept, and what is read back from there (see `readStoredCart`). */
export const CART_STORAGE_KEY = 'online-store:cart'
const storedCartSchema = z.object({ state: persistedCartSchema })

/** Whether two carts have the same lines, in the same order, with the same quantities. */
export function sameItems(a: readonly CartItem[], b: readonly CartItem[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]
      return (
        other !== undefined &&
        other.productId === item.productId &&
        other.quantity === item.quantity
      )
    })
  )
}

/**
 * The cart as this browser keeps it right now, read from storage and checked like anything else that
 * comes from there. `null` when storage cannot say: nothing is kept (a visit that has not changed the
 * cart yet, private mode), it cannot be read, or what is there is not a cart. The caller then goes by
 * the cart this tab holds.
 *
 * Another tab shares this storage and may have changed the cart since this tab last looked, so this
 * is what a change starts from (see the store below).
 */
export function readStoredCart(): CartItem[] | null {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (raw === null) return null
    const parsed = storedCartSchema.safeParse(JSON.parse(raw))
    return parsed.success ? mergeDuplicates(parsed.data.state.items) : null
  } catch {
    return null
  }
}

/**
 * The lines a change is made to: what the browser keeps now, or what this tab holds when storage has
 * nothing to say. Starting from what this tab remembers would write that over a change another tab
 * made in between, and the change would be lost.
 *
 * This is a read followed by a write, not a transaction: two tabs that change the cart at the very
 * same moment can still overwrite one another, and the later write wins. It narrows the window from
 * "as long as the tab has been open" to the instant between the read and the write.
 */
const currentItems = (state: { items: CartItem[] }): CartItem[] => readStoredCart() ?? state.items

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (productId, quantity = 1) =>
        set((state) => {
          if (!Number.isFinite(quantity) || quantity < 1) return state
          const lines = currentItems(state)
          const existing = lines.find((item) => item.productId === productId)
          if (!existing) {
            return { items: [...lines, { productId, quantity: clampQuantity(quantity) }] }
          }
          return {
            items: lines.map((item) =>
              item.productId === productId
                ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
                : item,
            ),
          }
        }),

      setQuantity: (productId, quantity) =>
        set((state) => {
          if (!Number.isFinite(quantity)) return state
          return {
            items: currentItems(state).map((item) =>
              item.productId === productId ? { ...item, quantity: clampQuantity(quantity) } : item,
            ),
          }
        }),

      removeItem: (productId) =>
        set((state) => ({
          items: currentItems(state).filter((item) => item.productId !== productId),
        })),

      retainOnly: (validIds) =>
        set((state) => {
          const lines = currentItems(state)
          const items = lines.filter((item) => validIds.has(item.productId))
          return items.length === lines.length && sameItems(lines, state.items) ? state : { items }
        }),

      clear: () => set({ items: [] }),
    }),
    {
      name: CART_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      // Stored data is untrusted (it can be edited or corrupted): validate, never spread it in.
      merge: (persisted, current) => {
        const parsed = persistedCartSchema.safeParse(persisted)
        return parsed.success ? { ...current, items: mergeDuplicates(parsed.data.items) } : current
      },
    },
  ),
)

/**
 * Makes the cart of this tab the one the browser keeps, when another tab has changed it. Returns
 * whether anything changed. Nothing is done when storage has nothing usable to say.
 *
 * Writing the cart back (the store saves every change) writes what was just read, so it is not a
 * change to storage and does not set the other tabs off in turn.
 */
export function adoptStoredCart(): boolean {
  const stored = readStoredCart()
  if (stored === null || sameItems(stored, useCartStore.getState().items)) return false
  useCartStore.setState({ items: stored })
  return true
}

/** Total number of units in the cart (what the header badge shows). */
export const selectCartCount = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0)

export const selectQuantityOf = (productId: string) => (state: CartState) =>
  state.items.find((item) => item.productId === productId)?.quantity ?? 0
