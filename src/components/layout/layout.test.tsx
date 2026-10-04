import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { CATEGORIES } from '@/features/products/categories'
import { RootLayout } from '@/layouts/RootLayout'
import { MobileNav } from './MobileNav'

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<h1>דף הבית</h1>} />
          <Route path="products" element={<h1>מוצרים</h1>} />
          <Route path="category/:id" element={<h1>קטגוריה</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RootLayout', () => {
  it('renders the landmarks and a skip link as the first focusable element', async () => {
    renderLayout()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

    await userEvent.tab()
    const skipLink = screen.getByRole('link', { name: 'דלג לתוכן הראשי' })
    expect(skipLink).toHaveFocus()
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('links every category in the category navigation', () => {
    renderLayout()

    // jsdom applies no CSS, so the (CSS-hidden) mobile dialog nav is also in the tree; the
    // desktop category bar comes first in document order.
    const [nav] = screen.getAllByRole('navigation', { name: 'קטגוריות' })
    for (const category of CATEGORIES) {
      expect(within(nav!).getByRole('link', { name: category.label })).toHaveAttribute(
        'href',
        `/category/${category.id}`,
      )
    }
  })

  it('marks the current section in the main navigation', () => {
    renderLayout('/products')

    const [mainNav] = screen.getAllByRole('navigation', { name: 'ניווט ראשי' })
    expect(within(mainNav!).getByRole('link', { name: 'מוצרים' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(mainNav!).getByRole('link', { name: 'בית' })).not.toHaveAttribute('aria-current')
  })

  it('renders the document in the main content region', () => {
    renderLayout()

    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'דף הבית' })).toBeVisible()
  })
})

describe('MobileNav', () => {
  function renderNav() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<MobileNav />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('opens and closes the menu dialog and keeps aria-expanded in sync', async () => {
    renderNav()
    const toggle = screen.getByRole('button', { name: 'פתיחת תפריט' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'תפריט ראשי' })
    expect(dialog).toHaveAttribute('open')

    await userEvent.click(screen.getByRole('button', { name: 'סגירת תפריט' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lists the main links and every category', async () => {
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'מוצרים' })).toHaveAttribute(
      'href',
      '/products',
    )
    expect(within(dialog).getAllByRole('link')).toHaveLength(2 + CATEGORIES.length)
  })

  it('closes after navigating via a link', async () => {
    renderNav()
    const toggle = screen.getByRole('button', { name: 'פתיחת תפריט' })
    await userEvent.click(toggle)

    await userEvent.click(screen.getByRole('link', { name: 'מוצרים' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
