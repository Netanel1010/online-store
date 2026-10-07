import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { paths } from '@/app/paths'
import { LogoutIcon, UserIcon } from '@/components/icons'
import { useToast } from '@/features/notifications/toastContext'
import { useAuthStatus, useAuthStore, useCurrentUser } from './authStore'
import { isProtectedPath } from './routing'

const buttonClass =
  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ink hover:bg-surface hover:text-brand'

/** A link that looks like the buttons, highlighted while its own page is open. */
const accountLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-brand-soft px-3 text-sm font-semibold text-brand'
    : buttonClass

/**
 * Sign-in link, or the signed-in visitor's name with a sign-out button.
 * "header" is compact (text shows from the sm breakpoint); "drawer" is the mobile-menu layout.
 */
export function AccountMenu({ variant }: { variant: 'header' | 'drawer' }) {
  const user = useCurrentUser()
  const status = useAuthStatus()
  const logout = useAuthStore((state) => state.logout)
  const endAllSessions = useAuthStore((state) => state.endAllSessions)
  const [endingEverywhere, setEndingEverywhere] = useState(false)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const toast = useToast()
  const labelClass = variant === 'header' ? 'hidden sm:inline' : ''
  // The message of a sign-out that waits until the visitor has left a protected page.
  const signOutAfterLeaving = useRef<string | null>(null)

  const finishSignOut = useCallback(
    (message: string) => {
      logout()
      toast.show({ message })
    },
    [logout, toast],
  )

  // Signing out while on a protected page: the sign-out waits until the visitor has actually
  // left it. Signing out first would make the page's guard redirect to the login page before the
  // navigation to the home page lands (navigation updates are applied with lower priority).
  useEffect(() => {
    const message = signOutAfterLeaving.current
    if (message !== null && !isProtectedPath(pathname)) {
      signOutAfterLeaving.current = null
      finishSignOut(message)
    }
  }, [pathname, finishSignOut])

  // A stored session is being confirmed: show neither the sign-in link nor a name that is not yet known.
  if (status === 'restoring') return null

  if (!user) {
    return (
      <div className={variant === 'drawer' ? 'flex flex-col' : undefined}>
        <NavLink to={paths.login} aria-label="התחברות" className={accountLinkClass}>
          <UserIcon />
          <span className={labelClass}>התחברות</span>
        </NavLink>
        {variant === 'drawer' && (
          <NavLink to={paths.register} className={accountLinkClass}>
            <span className="ps-7">הרשמה</span>
          </NavLink>
        )}
      </div>
    )
  }

  const signOut = (message = 'התנתקתם מהחשבון') => {
    if (isProtectedPath(pathname)) {
      signOutAfterLeaving.current = message
      navigate(paths.home)
    } else {
      finishSignOut(message)
    }
  }

  // Ends the account's sessions on the API first, and signs out here only once that is known to have
  // worked: if it could not be asked, the visitor stays signed in (and is told) instead of believing
  // that other devices were signed out when nothing is known about them.
  const signOutEverywhere = async () => {
    if (endingEverywhere) return
    setEndingEverywhere(true)
    const ended = await endAllSessions()
    setEndingEverywhere(false)
    if (ended) signOut('התנתקתם מכל המכשירים')
    else toast.show({ message: 'לא הצלחנו להתנתק מכל המכשירים. בדקו את החיבור ונסו שוב.' })
  }

  return (
    // In the header the signed-in controls start from the sm breakpoint: on a phone, a lone
    // sign-out icon next to the cart is too easy to hit by mistake. The menu has them instead.
    <div className={variant === 'drawer' ? 'flex flex-col' : 'hidden items-center sm:flex'}>
      <p className={`px-3 text-sm text-muted ${variant === 'header' ? 'hidden lg:block' : 'py-2'}`}>
        שלום, <bdi className="font-semibold text-ink">{user.name}</bdi>
      </p>
      {/* In the header there is room for this link only on wide screens; the menu always has it. */}
      <NavLink
        to={paths.orders}
        className={({ isActive }) =>
          variant === 'header'
            ? accountLinkClass({ isActive }).replace('inline-flex', 'hidden xl:inline-flex')
            : accountLinkClass({ isActive })
        }
      >
        <span className={variant === 'drawer' ? 'ps-7' : ''}>ההזמנות שלי</span>
      </NavLink>
      <button type="button" aria-label="התנתקות" onClick={() => signOut()} className={buttonClass}>
        <LogoutIcon />
        <span className={labelClass}>התנתקות</span>
      </button>
      {/* In the header there is room for this one only on wide screens; the menu always has it. */}
      <button
        type="button"
        onClick={signOutEverywhere}
        disabled={endingEverywhere}
        // In the header the base `inline-flex` is replaced, so `hidden` and `xl:inline-flex` never compete with it.
        className={
          variant === 'header'
            ? buttonClass.replace('inline-flex', 'hidden xl:inline-flex')
            : buttonClass
        }
      >
        <span className={variant === 'drawer' ? 'ps-7' : ''}>התנתקות מכל המכשירים</span>
      </button>
    </div>
  )
}
