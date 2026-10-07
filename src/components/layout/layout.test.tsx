import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { CATEGORIES } from '@/features/products/categories'
import { ToastProvider } from '@/features/notifications/ToastProvider'
import { rememberProducts } from '@/features/products/productCache'
import { RootLayout } from '@/layouts/RootLayout'
import { makeProduct } from '@/test/fixtures'
import type { Product } from '@/features/products/schema'
import { useCartStore } from '@/features/cart/cartStore'
import * as productService from '@/services/productService'
import { MobileNav } from './MobileNav'

// The layout asks the API about the ids in the cart and the favorites (to drop the ones with no
// product), so mock that and let it settle inside act(). The pages here are placeholders, so the
// products the real page in front of the visitor would have loaded are put in the cache by hand.
async function renderLayout(path = '/', catalog: Product[] = []) {
  rememberProducts(catalog)
  vi.spyOn(productService, 'fetchProductsByIds').mockImplementation((ids) =>
    Promise.resolve(catalog.filter((product) => ids.includes(product.id))),
  )
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<h1>דף הבית</h1>} />
            <Route path="products" element={<h1>מוצרים</h1>} />
            <Route path="products/:id" element={<h1>מוצר</h1>} />
            <Route path="category/:id" element={<h1>קטגוריה</h1>} />
            <Route path="cart" element={<h1>עגלה</h1>} />
            <Route path="favorites" element={<h1>מועדפים</h1>} />
            <Route path="login" element={<h1>התחברות</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  })
}

describe('RootLayout', () => {
  it('renders the landmarks and a skip link as the first focusable element', async () => {
    await renderLayout()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()

    await userEvent.tab()
    const skipLink = screen.getByRole('link', { name: 'דלג לתוכן הראשי' })
    expect(skipLink).toHaveFocus()
    expect(skipLink).toHaveAttribute('href', '#main-content')
  })

  it('links every category in the category navigation', async () => {
    await renderLayout()

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

  it('marks the current section in the main navigation', async () => {
    await renderLayout('/products')

    const [mainNav] = screen.getAllByRole('navigation', { name: 'ניווט ראשי' })
    expect(within(mainNav!).getByRole('link', { name: 'מוצרים' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(mainNav!).getByRole('link', { name: 'בית' })).not.toHaveAttribute('aria-current')
  })

  it('renders the document in the main content region', async () => {
    await renderLayout()

    expect(within(screen.getByRole('main')).getByRole('heading', { name: 'דף הבית' })).toBeVisible()
  })
})

describe('MobileNav', () => {
  function renderNav() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <ToastProvider>
          <Routes>
            <Route path="*" element={<MobileNav />} />
          </Routes>
        </ToastProvider>
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
    // Main links, every category, and the sign-in and registration links (signed out).
    expect(within(dialog).getAllByRole('link')).toHaveLength(2 + CATEGORIES.length + 2)
  })

  it('closes after navigating via a link', async () => {
    renderNav()
    const toggle = screen.getByRole('button', { name: 'פתיחת תפריט' })
    await userEvent.click(toggle)

    await userEvent.click(screen.getByRole('link', { name: 'מוצרים' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('header: the current page', () => {
  const gpu = makeProduct({ id: 'GPU-1', name: 'כרטיס', category: 'gpu' })
  const mainNav = () => screen.getAllByRole('navigation', { name: 'ניווט ראשי' })[0]!
  const categoryNav = () => screen.getAllByRole('navigation', { name: 'קטגוריות' })[0]!
  const current = (nav: HTMLElement) =>
    within(nav)
      .getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current'))
      .map((link) => `${link.textContent}=${link.getAttribute('aria-current')}`)

  it('marks only the home link on the home page', async () => {
    await renderLayout('/')

    expect(current(mainNav())).toEqual(['בית=page'])
    expect(current(categoryNav())).toEqual([])
  })

  it('marks "products" as the section on category and product pages, and the category too', async () => {
    await renderLayout('/products/GPU-1', [gpu])

    expect(current(mainNav())).toEqual(['מוצרים=true'])
    expect(current(categoryNav())).toEqual(['כרטיסי מסך=true'])
  })

  it('marks the category page itself as the current page', async () => {
    await renderLayout('/category/gpu')

    expect(current(mainNav())).toEqual(['מוצרים=true'])
    expect(current(categoryNav())).toEqual(['כרטיסי מסך=page'])
  })

  it('treats an address with a closing slash as the same page', async () => {
    await renderLayout('/products/')

    expect(current(mainNav())).toEqual(['מוצרים=page'])
  })

  it('does not guess a category for a product that is not in the catalog', async () => {
    await renderLayout('/products/NOPE', [gpu])

    expect(current(categoryNav())).toEqual([])
  })

  it.each([
    ['/cart', 'עגלת קניות'],
    ['/favorites', 'מועדפים'],
    ['/login', 'התחברות'],
  ])('marks the link of %s as the current page, and only that one', async (path, name) => {
    await renderLayout(path)

    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    const marked = within(banner)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(marked).toHaveLength(1)
  })
})

describe('header: cart badge', () => {
  it('pops when the number changes, not for the number the page loaded with', async () => {
    useCartStore.getState().addItem('A', 2)
    // The product must exist: the layout drops cart lines of products that are not in the catalog.
    await renderLayout('/', [makeProduct({ id: 'A' })])
    const badge = () => within(screen.getByRole('link', { name: /עגלת קניות/ })).getByText(/\d+/)

    expect(badge()).toHaveTextContent('2')
    expect(badge()).not.toHaveClass('motion-safe:animate-badge-pop')

    act(() => useCartStore.getState().addItem('A'))
    expect(badge()).toHaveTextContent('3')
    expect(badge()).toHaveClass('motion-safe:animate-badge-pop')
  })
})

describe('header: search on small screens', () => {
  it('opens the menu with the search box ready to type in', async () => {
    await renderLayout('/')

    await userEvent.click(screen.getByRole('button', { name: 'פתיחת חיפוש' }))

    const dialog = screen.getByRole('dialog', { name: 'תפריט ראשי' })
    expect(dialog).toHaveAttribute('open')
    expect(within(dialog).getByRole('searchbox', { name: 'חיפוש מוצרים' })).toHaveFocus()
  })

  it('opens the menu from the menu button without moving the focus into the search box', async () => {
    await renderLayout('/')

    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))

    const dialog = screen.getByRole('dialog', { name: 'תפריט ראשי' })
    expect(within(dialog).getByRole('searchbox')).not.toHaveFocus()
  })
})
