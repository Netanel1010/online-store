import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '@/app/routes'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('AppRoutes', () => {
  it('renders the home page inside the root layout', () => {
    renderAt('/')

    expect(
      screen.getByRole('heading', { level: 1, name: 'ברוכים הבאים לחנות' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'N.M.S - לדף הבית' })).toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes', () => {
    renderAt('/does-not-exist')

    expect(screen.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'חזרה לדף הבית' })).toHaveAttribute('href', '/')
  })
})
