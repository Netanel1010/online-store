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

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (productId, quantity = 1) =>
        set((state) => {
          if (!Number.isFinite(quantity) || quantity < 1) return state
          const existing = state.items.find((item) => item.productId === productId)
          if (!existing) {
            return { items: [...state.items, { productId, quantity: clampQuantity(quantity) }] }
          }
          return {
            items: state.items.map((item) =>
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
            items: state.items.map((item) =>
              item.productId === productId ? { ...item, quantity: clampQuantity(quantity) } : item,
            ),
          }
        }),

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((item) => item.productId !== productId) })),

      retainOnly: (validIds) =>
        set((state) => {
          const items = state.items.filter((item) => validIds.has(item.productId))
          return items.length === state.items.length ? state : { items }
        }),

      clear: () => set({ items: [] }),
    }),
    {
      name: 'online-store:cart',
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

/** Total number of units in the cart (what the header badge shows). */
export const selectCartCount = (state: CartState) =>
  state.items.reduce((sum, item) => sum + item.quantity, 0)

export const selectQuantityOf = (productId: string) => (state: CartState) =>
  state.items.find((item) => item.productId === productId)?.quantity ?? 0
