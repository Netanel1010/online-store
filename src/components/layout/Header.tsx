import { Link, NavLink } from 'react-router'
import { paths } from '@/app/paths'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { CATEGORIES } from '@/features/products/categories'
import { SearchForm } from '@/features/search/SearchForm'
import { HeaderShopLinks } from '@/features/shop/HeaderShopLinks'
import { MobileNav } from './MobileNav'
import { mainLinks, navLinkClass } from './navigation'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 shadow-sm backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4">
        <MobileNav />

        <Link
          to={paths.home}
          aria-label="N.M.S - לדף הבית"
          className="rounded-lg text-2xl font-extrabold tracking-wide text-brand transition-colors hover:text-brand-strong"
        >
          <span dir="ltr">N.M.S</span>
        </Link>

        <nav aria-label="ניווט ראשי" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {mainLinks.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `block rounded-lg px-3 py-2 text-base ${navLinkClass(isActive)}`
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <SearchForm className="hidden max-w-md flex-1 md:flex" />

        <HeaderShopLinks />
        <AccountMenu variant="header" />
      </div>

      <nav aria-label="קטגוריות" className="hidden border-t border-line bg-surface md:block">
        <ul className="container-page flex gap-1 overflow-x-auto py-1.5">
          {CATEGORIES.map((category) => (
            <li key={category.id} className="shrink-0">
              <NavLink
                to={paths.category(category.id)}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-1.5 text-sm ${navLinkClass(isActive)}`
                }
              >
                {category.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
