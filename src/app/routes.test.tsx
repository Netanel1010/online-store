import { screen } from '@testing-library/react'
import { renderApp } from '@/test/renderApp'

describe('AppRoutes', () => {
  it('renders the home page inside the root layout', async () => {
    renderApp('/')

    expect(screen.getByRole('heading', { level: 1, name: 'חנות רכיבי מחשב' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'N.M.S - לדף הבית' })).toBeInTheDocument()
    // Let the (empty) catalog request settle so no state update happens after the test.
    expect(await screen.findByRole('region', { name: 'מותגים' })).toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes', () => {
    renderApp('/does-not-exist')

    expect(screen.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'חזרה לדף הבית' })).toHaveAttribute('href', '/')
  })

  it('does not support the legacy .html URLs', () => {
    renderApp('/product%20page.html')

    expect(screen.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeInTheDocument()
  })
})
