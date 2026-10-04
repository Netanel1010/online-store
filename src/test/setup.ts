import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
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

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // Persisted stores outlive a test: reset their state, then wipe what they wrote to storage.
  useCartStore.setState({ items: [] })
  useFavoritesStore.setState({ ids: [] })
  localStorage.clear()
})
