import { Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { RouteCrash } from '@/components/shared/CrashScreens'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { PageLoading } from '@/components/shared/StateMessages'
import { useRestoreSession } from '@/features/auth/useRestoreSession'
import { ToastProvider } from '@/features/notifications/ToastProvider'
import { ShopStateReconciler } from '@/features/shop/ShopStateReconciler'

export function RootLayout() {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const isFirstRender = useRef(true)
  // Confirms the stored session with the API as soon as the site is on screen.
  useRestoreSession()

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
    <ToastProvider>
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
            {/* A page that fails shows a message here, inside the layout, and going to another
                page tries again. */}
            <ErrorBoundary
              resetKey={pathname}
              fallback={({ error, reset }) => <RouteCrash error={error} reset={reset} />}
            >
              <Suspense fallback={<PageLoading />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
        <Footer />
        <ShopStateReconciler />
      </div>
    </ToastProvider>
  )
}
