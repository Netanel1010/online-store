import { useCallback, useEffect, useId, useRef, useState } from 'react'
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

const itemClass =
  'flex min-h-11 w-full items-center rounded-lg px-3 text-start text-sm font-semibold text-ink hover:bg-surface hover:text-brand disabled:cursor-not-allowed disabled:opacity-50'

const activeItemClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? itemClass.replace('text-ink', 'bg-brand-soft text-brand') : itemClass

/**
 * Sign-in link, or the signed-in visitor's account.
 *
 * "header" is one "My account" button that opens a small panel with the visitor's name, the orders,
 * and the two ways to sign out. It is a disclosure (a button with `aria-expanded` that shows a
 * group of links and buttons), not an ARIA `menu`: that keeps the ordinary keyboard order, where Tab
 * moves through the items, and needs no arrow-key handling. Escape closes it and returns the focus to
 * the button; so do choosing an item, a click outside, moving to another page, and tabbing out of it.
 * "drawer" is the mobile-menu layout, a plain list, because the drawer is already a menu.
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
  // The panel is open for the page it was opened on, so going to another page closes it without an effect.
  const [openPath, setOpenPath] = useState<string | null>(null)
  const open = openPath === pathname
  const panelId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpenPath(null)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress)
  }, [open])

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

  // Choosing an item closes the panel. The focus goes back to the button first: the item that had it
  // is about to be hidden, and a focus that is lost would start the page over for a keyboard user.
  const closePanel = () => {
    triggerRef.current?.focus()
    setOpenPath(null)
  }

  if (variant === 'header') {
    return (
      <div
        ref={containerRef}
        className="relative"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation()
            closePanel()
          }
        }}
        onBlur={(event) => {
          // The focus left the account for something else: close, and leave the focus where it went.
          if (open && !containerRef.current?.contains(event.relatedTarget as Node | null)) {
            setOpenPath(null)
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="החשבון שלי"
          onClick={() => setOpenPath(open ? null : pathname)}
          className={buttonClass}
        >
          <UserIcon />
          <span className={labelClass}>החשבון שלי</span>
        </button>
        <div
          id={panelId}
          hidden={!open}
          className="absolute end-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-line bg-white p-2 shadow-lg"
        >
          <p className="px-3 py-2 text-sm text-muted">
            שלום, <bdi className="font-semibold text-ink">{user.name}</bdi>
          </p>
          <NavLink to={paths.orders} onClick={closePanel} className={activeItemClass}>
            ההזמנות שלי
          </NavLink>
          <button
            type="button"
            className={itemClass}
            onClick={() => {
              closePanel()
              signOut()
            }}
          >
            התנתקות
          </button>
          <button
            type="button"
            className={itemClass}
            disabled={endingEverywhere}
            onClick={() => {
              closePanel()
              void signOutEverywhere()
            }}
          >
            התנתקות מכל המכשירים
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <p className="px-3 py-2 text-sm text-muted">
        שלום, <bdi className="font-semibold text-ink">{user.name}</bdi>
      </p>
      <NavLink to={paths.orders} className={accountLinkClass}>
        <span className="ps-7">ההזמנות שלי</span>
      </NavLink>
      <button type="button" aria-label="התנתקות" onClick={() => signOut()} className={buttonClass}>
        <LogoutIcon />
        <span>התנתקות</span>
      </button>
      <button
        type="button"
        onClick={signOutEverywhere}
        disabled={endingEverywhere}
        className={buttonClass}
      >
        <span className="ps-7">התנתקות מכל המכשירים</span>
      </button>
    </div>
  )
}
