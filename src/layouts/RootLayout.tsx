import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { ShopStateReconciler } from '@/features/shop/ShopStateReconciler'

export function RootLayout() {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const isFirstRender = useRef(true)

  // BrowserRouter does not restore scroll or focus on navigation. Reset both so keyboard and
  // screen-reader users land at the start of the new page. Skipped on the initial load.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
      >
        דלג לתוכן הראשי
      </a>
      <Header />
      <main id="main-content" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        <div className="container-page py-8">
          <Outlet />
        </div>
      </main>
      <Footer />
      <ShopStateReconciler />
    </div>
  )
}
