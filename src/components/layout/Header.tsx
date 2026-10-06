import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { paths } from '@/app/paths'
import { SearchIcon } from '@/components/icons'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { CATEGORIES } from '@/features/products/categories'
import { SearchForm } from '@/features/search/SearchForm'
import { HeaderShopLinks } from '@/features/shop/HeaderShopLinks'
import { MobileNav, type MobileNavHandle } from './MobileNav'
import { CategoryNavLink, MainNavLink } from './NavItems'
import { mainLinks, navLinkClass } from './navigation'

/** Keeps the current category in view in the category bar, which scrolls sideways on small screens. */
function useScrollCurrentIntoView(containerRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const current = containerRef.current?.querySelector('[aria-current]')
    // Not available in every environment (jsdom has no layout).
    current?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  })
}

export function Header() {
  const mobileNav = useRef<MobileNavHandle>(null)
  const categoryBar = useRef<HTMLUListElement>(null)
  useScrollCurrentIntoView(categoryBar)

  return (
    <header className="sticky top-0 z-40 [@media(max-height:500px)]:static border-b border-line bg-white/95 shadow-sm backdrop-blur">
      <div className="container-page flex h-16 items-center gap-4 max-[374px]:gap-2">
        <MobileNav handleRef={mobileNav} />

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
                <MainNavLink
                  link={link}
                  className={(active) =>
                    `block rounded-lg px-3 py-2 text-base ${navLinkClass(active)}`
                  }
                >
                  {link.label}
                </MainNavLink>
              </li>
            ))}
          </ul>
        </nav>

        <SearchForm className="hidden max-w-md flex-1 md:flex" />

        <div className="ms-auto flex items-center gap-1">
          {/* On small screens the search box lives in the menu: this opens it with the box ready. */}
          <button
            type="button"
            aria-label="פתיחת חיפוש"
            aria-haspopup="dialog"
            onClick={() => mobileNav.current?.open({ focusSearch: true })}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface hover:text-brand max-[359px]:hidden md:hidden"
          >
            <SearchIcon className="size-6" />
          </button>
          <HeaderShopLinks />
          <AccountMenu variant="header" />
        </div>
      </div>

      <nav aria-label="קטגוריות" className="hidden border-t border-line bg-surface md:block">
        <ul
          ref={categoryBar}
          className="container-page flex gap-1 overflow-x-auto py-1.5 [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]"
        >
          {CATEGORIES.map((category) => (
            <li key={category.id} className="shrink-0">
              <CategoryNavLink
                categoryId={category.id}
                className={(active) =>
                  `block rounded-md px-3 py-1.5 text-sm ${navLinkClass(active)}`
                }
              >
                {category.label}
              </CategoryNavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
