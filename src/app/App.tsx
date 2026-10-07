import { BrowserRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'
import { AppCrash } from '@/components/shared/CrashScreens'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

// BASE_URL is "/" in dev and "/online-store/" in production builds (see vite.config.ts).
export function App() {
  return (
    // The last resort: if the layout itself fails, the visitor sees a message, not a blank page.
    <ErrorBoundary fallback={({ error }) => <AppCrash error={error} />}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  )
}
