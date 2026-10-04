/** Decorative placeholder. Pages announce loading through a status region, not through this. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-line motion-safe:animate-pulse ${className}`}
    />
  )
}
