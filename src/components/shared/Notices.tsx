import type { ReactNode } from 'react'

/** A standing explanation on the page (for example that this is a demo). */
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="הערה"
      className="rounded-lg border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-ink"
    >
      {children}
    </aside>
  )
}

/** A form-level error (not tied to one field). Announced as soon as it appears. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-sale/30 bg-sale-soft px-4 py-3 text-sm text-sale"
    >
      {children}
    </div>
  )
}
