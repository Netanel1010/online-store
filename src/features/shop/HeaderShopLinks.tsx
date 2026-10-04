import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { CartIcon, HeartIcon } from '@/components/icons'
import { selectCartCount, useCartStore } from '@/features/cart/cartStore'
import { useFavoritesStore } from '@/features/favorites/favoritesStore'

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span
      aria-hidden="true"
      className="absolute -end-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold leading-5 text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function IconLink({ to, label, children }: { to: string; label: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface hover:text-brand"
    >
      {children}
    </Link>
  )
}

/** Header links to favorites and the cart, with live counts. */
export function HeaderShopLinks() {
  const cartCount = useCartStore(selectCartCount)
  const favoritesCount = useFavoritesStore((state) => state.ids.length)

  return (
    <div className="ms-auto flex items-center gap-1">
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
