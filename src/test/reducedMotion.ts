import { vi } from 'vitest'

type ChangeListener = () => void

/**
 * jsdom has no `matchMedia`. This installs one that answers the reduced-motion query with
 * `matches`, and returns a function that changes the answer and notifies listeners. Undo it with
 * `vi.unstubAllGlobals()`.
 */
export function stubReducedMotion(matches: boolean) {
  let current = matches
  const listeners = new Set<ChangeListener>()

  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('prefers-reduced-motion') && current
    },
    media: query,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
  }))

  return (next: boolean) => {
    current = next
    listeners.forEach((listener) => listener())
  }
}
