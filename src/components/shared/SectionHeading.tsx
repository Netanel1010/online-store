import type { ReactNode } from 'react'

/** Heading of a home page section: the title with a short accent bar, so sections read at a glance. */
export function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-5 flex items-center gap-3 text-2xl font-bold tracking-tight before:h-6 before:w-1 before:rounded-full before:bg-brand"
    >
      {children}
    </h2>
  )
}
