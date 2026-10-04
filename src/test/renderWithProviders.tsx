import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/features/notifications/ToastProvider'

/** Renders a component that needs the router and the toast provider (as inside RootLayout). */
export function renderWithProviders(ui: ReactElement) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  )
}
