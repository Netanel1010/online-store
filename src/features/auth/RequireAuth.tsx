import { Navigate, Outlet, useLocation } from 'react-router'
import { paths } from '@/app/paths'
import { ErrorState, PageLoading } from '@/components/shared/StateMessages'
import { useAuthStatus, useAuthStore, useCurrentUser } from './authStore'
import type { RedirectState } from './routing'
import { useRestoreSession } from './useRestoreSession'

/**
 * Layout route for pages that need a signed-in visitor. A visitor with a stored session waits
 * while the API confirms it; a signed-out visitor is sent to the login page and returned here
 * afterwards. If the API cannot be reached the visitor is not signed out (nothing has been said
 * against the session): they are told, and can try again.
 *
 * This is the experience, not the security: the screens are hidden from signed-out visitors, but
 * what the API gives is decided by the API, with the same session, on every request.
 */
export function RequireAuth() {
  const status = useAuthStatus()
  const user = useCurrentUser()
  const restore = useAuthStore((state) => state.restore)
  const location = useLocation()
  useRestoreSession()

  if (status === 'restoring') return <PageLoading />
  if (status === 'unavailable') {
    return (
      <ErrorState title="לא הצלחנו לאמת את ההתחברות" onRetry={() => void restore()}>
        אי אפשר להתחבר לשרת כרגע. נסו שוב בעוד רגע.
      </ErrorState>
    )
  }
  if (!user) {
    const state: RedirectState = { from: `${location.pathname}${location.search}` }
    return <Navigate to={paths.login} replace state={state} />
  }
  return <Outlet />
}
