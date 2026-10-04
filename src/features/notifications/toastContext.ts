import { createContext, useContext, type ReactNode } from 'react'

export interface ToastOptions {
  /** Plain text. It is shown and announced to screen readers. */
  message: string
  /** Optional extra control, such as a link to the cart. Must be keyboard-reachable content. */
  action?: ReactNode
  /** How long the toast stays before it closes on its own. Defaults to 5 seconds. */
  durationMs?: number
}

export interface ToastApi {
  show: (options: ToastOptions) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
