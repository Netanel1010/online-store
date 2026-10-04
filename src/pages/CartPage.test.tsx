import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCartStore } from '@/features/cart/cartStore'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const psu = makeProduct({ id: 'PSU-1', name: 'ספק כוח', price: { current: 1000 } })
const gpu = makeProduct({
  id: 'GPU-1',
  name: 'כרטיס מסך',
  price: { current: 750, original: 1000 },
})
const catalog = [psu, gpu]

const summary = () => screen.getByRole('complementary', { name: 'סיכום הזמנה' })

describe('CartPage', () => {
  it('shows a loading status and then the empty state for an empty cart', async () => {
    renderApp('/cart', catalog)

    expect(screen.getByText('טוען עגלה…')).toBeInTheDocument()
    expect(await screen.findByText('העגלה ריקה')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('lists the cart lines with their line totals, in the order they were added', async () => {
    useCartStore.getState().addItem('GPU-1', 2)
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)

    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })
    // Each cart line is the list item that holds a remove button.
    const lines = screen
      .getAllByRole('button', { name: /הסרת/ })
      .map((button) => button.closest('li')!)
    expect(lines).toHaveLength(2)
    expect(within(lines[0]!).getByRole('link', { name: 'כרטיס מסך' })).toHaveAttribute(
      'href',
      '/products/GPU-1',
    )
    expect(within(lines[0]!).getByText(/1,500/)).toBeInTheDocument() // 2 x 750
    expect(within(lines[1]!).getByRole('link', { name: 'ספק כוח' })).toBeInTheDocument()
  })

  it('calculates the order summary from the cart instead of showing a fixed total', async () => {
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1', 2)
    renderApp('/cart', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    // 1 x 1,000 + 2 x 750 = 2,500; before discounts 1 x 1,000 + 2 x 1,000 = 3,000.
    expect(within(summary()).getByText('מספר פריטים').nextElementSibling).toHaveTextContent('3')
    expect(within(summary()).getByText('סה"כ').nextElementSibling).toHaveTextContent(/2,500/)
    expect(within(summary()).getByText('מחיר לפני הנחות').nextElementSibling).toHaveTextContent(
      /3,000/,
    )
    expect(within(summary()).getByText('חיסכון').nextElementSibling).toHaveTextContent(/500/)
  })

  it('hides the savings rows when nothing is on sale', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    expect(within(summary()).queryByText('חיסכון')).not.toBeInTheDocument()
  })

  it('updates lines, totals and the stored cart when the quantity changes', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות: ספק כוח' }))
    await userEvent.click(screen.getByRole('button', { name: 'הגדלת כמות: ספק כוח' }))

    expect(useCartStore.getState().items).toEqual([{ productId: 'PSU-1', quantity: 3 }])
    expect(within(summary()).getByText('סה"כ').nextElementSibling).toHaveTextContent(/3,000/)

    const field = screen.getByRole('textbox', { name: 'כמות ספק כוח' })
    await userEvent.clear(field)
    await userEvent.type(field, '5')
    expect(within(summary()).getByText('סה"כ').nextElementSibling).toHaveTextContent(/5,000/)
  })

  it('removes a line, updates the totals, announces it and keeps focus on the page heading', async () => {
    useCartStore.getState().addItem('PSU-1')
    useCartStore.getState().addItem('GPU-1')
    renderApp('/cart', catalog)
    await screen.findByRole('complementary', { name: 'סיכום הזמנה' })

    await userEvent.click(screen.getByRole('button', { name: 'הסרת ספק כוח מהעגלה' }))

    expect(useCartStore.getState().items).toEqual([{ productId: 'GPU-1', quantity: 1 }])
    expect(screen.queryByRole('link', { name: 'ספק כוח' })).not.toBeInTheDocument()
    expect(within(summary()).getByText('סה"כ').nextElementSibling).toHaveTextContent(/750/)
    expect(screen.getByText('ספק כוח הוסר מהעגלה')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'עגלת קניות' })).toHaveFocus()
  })

  it('shows the empty state after the last line is removed', async () => {
    useCartStore.getState().addItem('PSU-1')
    renderApp('/cart', catalog)

    await userEvent.click(await screen.findByRole('button', { name: 'הסרת ספק כוח מהעגלה' }))

    expect(screen.getByText('העגלה ריקה')).toBeInTheDocument()
  })

  it('shows an error with retry when the catalog cannot be loaded', async () => {
    renderApp('/cart', new Error('down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
  })
})

describe('header cart badge', () => {
  it('shows the total quantity, not the number of lines, and an accessible label', async () => {
    useCartStore.getState().addItem('PSU-1', 2)
    useCartStore.getState().addItem('GPU-1', 3)
    renderApp('/products', catalog)

    const link = await screen.findByRole('link', { name: 'עגלת קניות, 5 פריטים' })
    expect(link).toHaveAttribute('href', '/cart')
    expect(link).toHaveTextContent('5')
  })

  it('has no badge for an empty cart and updates live when a product is added', async () => {
    renderApp('/products', catalog)

    const link = await screen.findByRole('link', { name: 'עגלת קניות' })
    expect(link).toHaveTextContent('')

    const [firstCard] = screen.getAllByRole('article')
    await userEvent.click(within(firstCard!).getByRole('button', { name: /הוספה לעגלה/ }))

    expect(screen.getByRole('link', { name: 'עגלת קניות, 1 פריטים' })).toHaveTextContent('1')
  })

  it('caps the displayed count at 99+', async () => {
    useCartStore.getState().addItem('PSU-1', 99)
    useCartStore.getState().addItem('GPU-1', 5)
    renderApp('/products', catalog)

    expect(await screen.findByRole('link', { name: /עגלת קניות/ })).toHaveTextContent('99+')
  })
})
