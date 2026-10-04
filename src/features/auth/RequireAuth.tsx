import { Navigate, Outlet, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { useCurrentUser } from './authStore'
import type { RedirectState } from './routing'

/**
 * Layout route for pages that need a signed-in visitor. Signed-out visitors are sent to the
 * login page and returned here afterwards. This is a demo gate in the browser: it protects the
 * screens, not any data (there is no server).
 */
export function RequireAuth() {
  const user = useCurrentUser()
  const location = useLocation()

  if (!user) {
    const state: RedirectState = { from: `${location.pathname}${location.search}` }
    return <Navigate to={paths.login} replace state={state} />
  }
  return <Outlet />
}
