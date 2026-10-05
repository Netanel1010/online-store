import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useLocation } from 'react-router'
import { CloseIcon, MenuIcon } from '@/components/icons'
import { AccountMenu } from '@/features/auth/AccountMenu'
import { CATEGORIES } from '@/features/products/categories'
import { SearchForm } from '@/features/search/SearchForm'
import { CategoryNavLink, MainNavLink } from './NavItems'
import { mainLinks, navLinkClass } from './navigation'

export interface MobileNavHandle {
  /** Opens the menu. With `focusSearch` the search box gets the focus, ready to type. */
  open: (options?: { focusSearch?: boolean }) => void
}

/**
 * Slide-in menu for small screens, built on the native <dialog> element: showModal() gives us
 * a focus trap, Escape-to-close, an inert page behind it and a backdrop without a dependency.
 * It docks to the inline-start edge, which is the right edge in RTL.
 */
export function MobileNav({ handleRef }: { handleRef?: Ref<MobileNavHandle> }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const { key: locationKey } = useLocation()

  // Close after any navigation (including a new search on the same page). The dialog's `close`
  // event keeps `open` in sync.
  useEffect(() => {
    dialogRef.current?.close()
  }, [locationKey])

  const openMenu = ({ focusSearch = false }: { focusSearch?: boolean } = {}) => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()
    setOpen(true)
    if (focusSearch) {
      dialog.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
    } else {
      // The list is long: show the current page's link instead of the top of the list.
      const current =
        dialog.querySelector('#mobile-categories-heading + ul [aria-current]') ??
        dialog.querySelector('nav [aria-current]')
      current?.scrollIntoView?.({ block: 'nearest' })
    }
  }

  useImperativeHandle(handleRef, () => ({ open: openMenu }))

  return (
    <>
      <button
        type="button"
        aria-label="פתיחת תפריט"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => openMenu()}
        className="inline-flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface md:hidden"
      >
        <MenuIcon className="size-6" />
      </button>

      <dialog
        id="mobile-nav"
        ref={dialogRef}
        aria-label="תפריט ראשי"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // A click on the backdrop targets the dialog element itself.
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
        className="m-0 me-auto h-dvh max-h-none w-80 max-w-[85vw] bg-white p-0 text-ink shadow-xl backdrop:bg-black/50"
      >
        <div className="flex h-full flex-col overflow-y-auto">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-4 py-3">
            <span className="text-lg font-bold">תפריט</span>
            <button
              type="button"
              aria-label="סגירת תפריט"
              onClick={() => dialogRef.current?.close()}
              className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>

          <SearchForm className="flex px-4 py-3" />

          <div className="border-b border-line px-2 pb-2">
            <AccountMenu variant="drawer" />
          </div>

          <nav aria-label="ניווט ראשי" className="p-2">
            <ul>
              {mainLinks.map((link) => (
                <li key={link.to}>
                  <MainNavLink link={link} className={mobileLinkClass}>
                    {link.label}
                  </MainNavLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="mobile-categories-heading" className="border-t border-line p-2">
            <h2
              id="mobile-categories-heading"
              className="px-3 py-2 text-sm font-semibold text-muted"
            >
              קטגוריות
            </h2>
            <ul>
              {CATEGORIES.map((category) => (
                <li key={category.id}>
                  <CategoryNavLink categoryId={category.id} className={mobileLinkClass}>
                    {category.label}
                  </CategoryNavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </>
  )
}

const mobileLinkClass = (active: boolean) =>
  `block rounded-lg px-3 py-3 text-base ${navLinkClass(active)}`
