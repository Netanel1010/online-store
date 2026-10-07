import { paths } from '@/app/paths'

export interface RedirectState {
  /** Where the visitor was heading before being sent to the login page. */
  from?: string
}

/**
 * Where to go after signing in. Only an app-internal path is accepted ("/checkout", never
 * "https://elsewhere" or "//elsewhere"), so a forged location state cannot send someone away.
 * Login and registration pages are never a destination.
 */
export function getRedirectTarget(state: unknown): string {
  const from = (state as RedirectState | null)?.from
  if (typeof from !== 'string') return paths.home
  if (!from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return paths.home
  const pathname = from.split(/[?#]/)[0]
  if (pathname === paths.login || pathname === paths.register) return paths.home
  return from
}

/** Pages that need a signed-in visitor. */
export function isProtectedPath(pathname: string): boolean {
  return (
    pathname === paths.checkout ||
    pathname.startsWith(`${paths.checkout}/`) ||
    pathname === '/orders' ||
    pathname.startsWith('/orders/')
  )
}
