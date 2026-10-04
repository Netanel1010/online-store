import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CloseIcon } from '@/components/icons'
import { ToastContext, type ToastApi, type ToastOptions } from './toastContext'

const DEFAULT_DURATION_MS = 5000
const MAX_VISIBLE = 3

interface ToastEntry extends ToastOptions {
  id: number
}

/**
 * Lightweight notifications, built for accessibility rather than with a UI library:
 *
 * - Screen readers hear every message once, through ONE persistent polite live region. (Live
 *   regions that are inserted together with their text are announced unreliably.)
 * - The visible toasts are ordinary content in a labelled region: their action is a real link or
 *   button the keyboard can reach, and each has a close button.
 * - A toast stays while the pointer is over it or focus is inside it, so it never disappears
 *   under someone who is reading it or about to use its action.
 * - No animation, so nothing to switch off for reduced-motion users.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const [announcement, setAnnouncement] = useState('')
  const nextId = useRef(1)
  const announcements = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    setToasts((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE))
    // Alternate a trailing no-break space so an identical message is announced again.
    announcements.current += 1
    setAnnouncement(options.message + (announcements.current % 2 === 0 ? ' ' : ''))
  }, [])

  const api = useMemo<ToastApi>(() => ({ show }), [show])

  return (
    <ToastContext value={api}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      <section
        aria-label="התראות"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const duration = toast.durationMs ?? DEFAULT_DURATION_MS

  useEffect(() => {
    if (paused) return
    const timer = setTimeout(() => onDismiss(toast.id), duration)
    return () => clearTimeout(timer)
  }, [paused, duration, toast.id, onDismiss])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg"
    >
      <p className="flex-1">{toast.message}</p>
      {toast.action && <div className="shrink-0 font-semibold underline">{toast.action}</div>}
      <button
        type="button"
        aria-label="סגירת התראה"
        onClick={() => onDismiss(toast.id)}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-white/15"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  )
}
