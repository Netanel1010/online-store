import { Link, useLocation, useNavigate } from 'react-router'
import { paths } from '@/app/paths'
import { LogoutIcon, UserIcon } from '@/components/icons'
import { useToast } from '@/features/notifications/toastContext'
import { useAuthStore, useCurrentUser } from './authStore'
import { isProtectedPath } from './routing'

const buttonClass =
  'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-surface hover:text-brand'

/**
 * Sign-in link, or the signed-in visitor's name with a sign-out button.
 * "header" is compact (text shows from the sm breakpoint); "drawer" is the mobile-menu layout.
 */
export function AccountMenu({ variant }: { variant: 'header' | 'drawer' }) {
  const user = useCurrentUser()
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const toast = useToast()
  const labelClass = variant === 'header' ? 'hidden sm:inline' : ''

  if (!user) {
    return (
      <div className={variant === 'drawer' ? 'flex flex-col' : undefined}>
        <Link to={paths.login} aria-label="התחברות" className={buttonClass}>
          <UserIcon />
          <span className={labelClass}>התחברות</span>
        </Link>
        {variant === 'drawer' && (
          <Link to={paths.register} className={buttonClass}>
            <span className="ps-7">הרשמה</span>
          </Link>
        )}
      </div>
    )
  }

  const signOut = () => {
    // Leave pages that need a signed-in visitor first, so the visitor lands on the home page
    // rather than on the login page.
    if (isProtectedPath(pathname)) navigate(paths.home)
    logout()
    toast.show({ message: 'התנתקתם מהחשבון' })
  }

  return (
    <div className={variant === 'drawer' ? 'flex flex-col' : 'flex items-center'}>
      <p className={`px-3 text-sm text-muted ${variant === 'header' ? 'hidden lg:block' : 'py-2'}`}>
        שלום, <bdi className="font-semibold text-ink">{user.name}</bdi>
      </p>
      <button type="button" aria-label="התנתקות" onClick={signOut} className={buttonClass}>
        <LogoutIcon />
        <span className={labelClass}>התנתקות</span>
      </button>
    </div>
  )
}
