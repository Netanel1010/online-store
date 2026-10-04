import { BrowserRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'

// BASE_URL is "/" in dev and "/online-store/" in production builds (see vite.config.ts).
export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppRoutes />
    </BrowserRouter>
  )
}
