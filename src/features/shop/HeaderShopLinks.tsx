import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { paths } from '@/app/paths'
import { CartIcon, HeartIcon } from '@/components/icons'
import { selectCartCount, useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'

function CountBadge({ count }: { count: number }) {
  // Whenever the number changes the badge is replaced by a new element, which plays a short pop
  // (skipped with reduced motion). Nothing plays for the number the page loaded with.
  const [seen, setSeen] = useState(count)
  const [changes, setChanges] = useState(0)
  if (count !== seen) {
    setSeen(count)
    setChanges(changes + 1)
  }

  if (count === 0) return null
  return (
    <span
      key={changes}
      aria-hidden="true"
      className={`absolute -end-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold leading-5 text-white ${
        changes > 0 ? 'motion-safe:animate-badge-pop' : ''
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** A header icon link. It is highlighted, and marked as the current page, when its page is open. */
function IconLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      aria-label={label}
      className={({ isActive }) =>
        `relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors ${
          isActive ? 'bg-brand-soft text-brand' : 'text-ink hover:bg-surface hover:text-brand'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

/** Header links to favorites and the cart, with live counts. */
export function HeaderShopLinks() {
  const cartCount = useCartStore(selectCartCount)
  const favoritesCount = useFavoritesStore((state) => state.ids.length)

  return (
    <div className="flex items-center gap-1">
      <IconLink
        to={paths.favorites}
        label={favoritesCount > 0 ? `מועדפים, ${favoritesCount} פריטים` : 'מועדפים'}
      >
        <HeartIcon className="size-6" />
        <CountBadge count={favoritesCount} />
      </IconLink>
      <IconLink
        to={paths.cart}
        label={cartCount > 0 ? `עגלת קניות, ${cartCount} פריטים` : 'עגלת קניות'}
      >
        <CartIcon className="size-6" />
        <CountBadge count={cartCount} />
      </IconLink>
    </div>
  )
}
