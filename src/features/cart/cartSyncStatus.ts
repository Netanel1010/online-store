import { create } from 'zustand'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from './cartStore.ts'

/**
 * Whether the cart of the signed-in account is still being read from the API (see `cartSync.ts`).
 * Not kept in storage: a page that loads starts without knowing.
 */
export const useCartSyncStatus = create<{ reading: boolean }>(() => ({ reading: false }))

/**
 * True while an empty cart on screen may only mean that the account's cart has not arrived yet (a
 * visitor signed in on a new device, or a host that is waking up), so that the pages show "loading"
 * and not "the cart is empty". A cart that already has lines never waits.
 */
export function useCartIsLoading(): boolean {
  const reading = useCartSyncStatus((state) => state.reading)
  const restoring = useAuthStore((state) => state.status === 'restoring')
  const empty = useCartStore((state) => state.items.length === 0)
  return empty && (reading || restoring)
}
