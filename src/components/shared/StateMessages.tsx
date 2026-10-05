import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface MessageProps {
  title: string
  /** Use "h1" when the message is the main content of a page. */
  as?: 'h1' | 'h2'
  children?: ReactNode
  /** Extra help below the message, such as suggestions for what to try next. */
  details?: ReactNode
  /** A decorative icon above the title. */
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  title,
  as: Heading = 'h2',
  children,
  details,
  icon,
  action,
}: MessageProps) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && (
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-white text-muted shadow-sm"
        >
          {icon}
        </div>
      )}
      <Heading className="text-lg font-semibold">{title}</Heading>
      {children && <p className="mt-2 text-muted">{children}</p>}
      {details && <div className="mx-auto mt-4 max-w-md text-sm text-muted">{details}</div>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

/** Shown while a page that loads on demand is being fetched. */
export function PageLoading() {
  return (
    <div role="status" className="py-24 text-center text-muted">
      טוען…
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  children?: ReactNode
  onRetry?: () => void
}

/** Announced to assistive technology as soon as it appears. */
export function ErrorState({
  title = 'משהו השתבש',
  children = 'לא הצלחנו לטעון את המוצרים. נסו שוב בעוד רגע.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-sale/30 bg-sale-soft px-6 py-12 text-center"
    >
      <h2 className="text-lg font-semibold text-sale">{title}</h2>
      <p className="mt-2 text-muted">{children}</p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button onClick={onRetry}>נסו שוב</Button>
        </div>
      )}
    </div>
  )
}
