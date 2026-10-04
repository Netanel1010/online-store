import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'

interface FavoritesState {
  /** Product ids in the order they were added. */
  ids: string[]
  toggle: (productId: string) => void
  remove: (productId: string) => void
  /** Drops ids whose product no longer exists in the catalog. */
  retainOnly: (validIds: ReadonlySet<string>) => void
  clear: () => void
}

const persistedFavoritesSchema = z.object({ ids: z.array(z.string().min(1)) })

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      ids: [],

      toggle: (productId) =>
        set((state) => ({
          ids: state.ids.includes(productId)
            ? state.ids.filter((id) => id !== productId)
            : [...state.ids, productId],
        })),

      remove: (productId) => set((state) => ({ ids: state.ids.filter((id) => id !== productId) })),

      retainOnly: (validIds) =>
        set((state) => {
          const ids = state.ids.filter((id) => validIds.has(id))
          return ids.length === state.ids.length ? state : { ids }
        }),

      clear: () => set({ ids: [] }),
    }),
    {
      name: 'online-store:favorites',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ ids: state.ids }),
      merge: (persisted, current) => {
        const parsed = persistedFavoritesSchema.safeParse(persisted)
        return parsed.success ? { ...current, ids: [...new Set(parsed.data.ids)] } : current
      },
    },
  ),
)

export const selectIsFavorite = (productId: string) => (state: FavoritesState) =>
  state.ids.includes(productId)
