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

/**
 * Where a navigation link stands relative to the page being viewed:
 *  - `page`: the link points at this very page
 *  - `section`: the page belongs to what the link stands for (a product page under its category)
 *  - `null`: unrelated
 */
export type LinkState = 'page' | 'section' | null

/** Pages are served as folders on GitHub Pages, so "/products/" and "/products" are the same page. */
function withoutTrailingSlash(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

/** The home link is for the home page only; "products" also covers category and product pages. */
export function mainLinkState(link: MainLink, pathname: string): LinkState {
  const current = withoutTrailingSlash(pathname)
  if (current === link.to) return 'page'
  if (link.to === paths.products) {
    return current.startsWith('/products/') || current.startsWith('/category/') ? 'section' : null
  }
  return null
}

/** The category (and whether it is the page itself) a path belongs to, without needing the catalog. */
export function categoryOfPath(pathname: string): { id: string; exact: boolean } | null {
  const match = /^\/category\/([^/]+)$/.exec(withoutTrailingSlash(pathname))
  return match ? { id: decodeURIComponent(match[1]!), exact: true } : null
}

/** The product id of a product page path, if it is one. */
export function productIdOfPath(pathname: string): string | null {
  const match = /^\/products\/([^/]+)$/.exec(withoutTrailingSlash(pathname))
  return match ? decodeURIComponent(match[1]!) : null
}

export function ariaCurrent(state: LinkState): 'page' | 'true' | undefined {
  if (state === 'page') return 'page'
  return state === 'section' ? 'true' : undefined
}
