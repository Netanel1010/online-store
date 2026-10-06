import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'
import { fetchPolicy } from '@/lib/fetchWithRetry'

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
  localStorage.clear()
})
