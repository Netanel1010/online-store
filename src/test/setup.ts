import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { useAuthStore } from '@/features/auth/authStore'
import { useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'

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

// `findBy*` and `waitFor` give up after 1 s by default. Registering hashes the password (PBKDF2)
// and several tests then wait for a redirect, which can take longer than that when all test files
// run in parallel on a busy or small machine. Waiting longer only costs time when something is slow.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Persisted stores outlive a test: reset their state, then wipe what they wrote to storage.
  useAuthStore.setState({ users: [], currentUserId: null })
  useCartStore.setState({ items: [] })
  useFavoritesStore.setState({ ids: [] })
  localStorage.clear()
})
