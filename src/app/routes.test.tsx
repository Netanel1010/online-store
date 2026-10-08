import { screen, within } from '@testing-library/react'
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

  it('helps a lost visitor on: the products page and every category', () => {
    renderApp('/does-not-exist')

    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
    const categories = within(screen.getByRole('navigation', { name: 'המשך לקטגוריה' }))
    expect(categories.getAllByRole('link')).toHaveLength(12)
    expect(categories.getByRole('link', { name: 'מעבדים' })).toHaveAttribute(
      'href',
      '/category/cpu',
    )
  })

  it('does not support the legacy .html URLs', () => {
    renderApp('/product%20page.html')

    expect(screen.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeInTheDocument()
  })
})
