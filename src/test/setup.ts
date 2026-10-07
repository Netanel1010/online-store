import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { cartSyncPolicy } from '@/features/cart/cartSync'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { resetProductCache } from '@/features/products/productCache'
import { resetCategoryCounts } from '@/features/products/useCategoryCounts'
import { fetchPolicy } from '@/lib/fetchWithRetry'
import { suggestionPolicy } from '@/features/products/useProductSuggestions'

// Not every jsdom version implements the modal <dialog> API. Provide just enough of it for
// components that open a modal dialog and react to its `close` event.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
}

// The app repeats a read of the API that fails (a sleeping host wakes up slowly). A test of a failed
// request must not wait for that, so there are no retries here; fetchWithRetry.test.ts sets its own.
fetchPolicy.delaysMs = []
// The cart is sent to the API right away (no wait to gather clicks) and a failed attempt is not repeated
// behind the test's back; cartSync.test.ts sets its own.
cartSyncPolicy.debounceMs = 0
// The suggestions under the search box are asked for without waiting for a pause in the typing.
suggestionPolicy.debounceMs = 0
cartSyncPolicy.retryDelaysMs = [3_600_000]

// `findBy*` and `waitFor` give up after 1 s by default. Registering hashes the password (scrypt, in
// the API the tests run) and several tests then wait for a redirect, which can take longer than
// that when all test files run in parallel on a busy or small machine. Waiting longer only costs
// time when something is slow.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Persisted stores outlive a test: reset their state, then wipe what they wrote to storage.
  useAuthStore.setState({ token: null, expiresAt: null, user: null, status: 'anonymous' })
  useCartStore.setState({ items: [] })
  useFavoritesStore.setState({ ids: [] })
  // What a visit remembers about the catalog (the products seen, the category counts).
  resetProductCache()
  resetCategoryCounts()
  localStorage.clear()
})
