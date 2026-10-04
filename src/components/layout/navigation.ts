import { paths } from '@/app/paths'

export interface MainLink {
  to: string
  label: string
  /** Match the path exactly, so "/" is not active on every page. */
  end?: boolean
}

export const mainLinks: readonly MainLink[] = [
  { to: paths.home, label: 'בית', end: true },
  { to: paths.products, label: 'מוצרים', end: true },
]

export function navLinkClass(isActive: boolean) {
  return isActive
    ? 'bg-brand-soft font-semibold text-brand'
    : 'text-ink hover:bg-surface hover:text-brand'
}
