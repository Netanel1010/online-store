import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const product = makeProduct({
  id: 'GV-N406',
  name: 'Gigabyte RTX 4060 Ti',
  fullName: 'Gigabyte RTX 4060 Ti (DLSS 3) GV-N406',
  price: { current: 2138, eilat: 1630 },
  warranty: '3 שנים',
  manufacturerUrl: 'https://www.gigabyte.com/product',
  features: ['DLSS 3', 'זיכרון 8GB'],
  specs: [
    { label: 'מעבד גרפי', value: 'NVIDIA RTX 4060 Ti' },
    { label: 'רוחב פס זיכרון', value: '128-bit' },
  ],
})

describe('ProductDetailPage', () => {
  it('shows a loading status, then the product details', async () => {
    renderApp('/products/GV-N406', [product])

    expect(screen.getByText('טוען מוצר…')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { level: 1, name: product.fullName }),
    ).toBeInTheDocument()
    expect(screen.queryByText('טוען מוצר…')).not.toBeInTheDocument()
    expect(screen.getByText('GV-N406')).toBeInTheDocument()
    expect(screen.getByText('3 שנים')).toBeInTheDocument()
  })

  it('shows the price, the Eilat price and the breadcrumb trail', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByText(/2,138/)).toBeInTheDocument()
    expect(screen.getByText(/מחיר באילת/)).toHaveTextContent(/1,630/)

    const trail = screen.getByRole('navigation', { name: 'פירורי לחם' })
    expect(within(trail).getByRole('link', { name: 'כרטיסי מסך' })).toHaveAttribute(
      'href',
      '/category/gpu',
    )
    expect(within(trail).getByText(product.name)).toHaveAttribute('aria-current', 'page')
  })

  it('omits the Eilat price when the product has none', async () => {
    renderApp('/products/GV-N406', [makeProduct({ ...product, price: { current: 2138 } })])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByText(/מחיר באילת/)).not.toBeInTheDocument()
  })

  it('lists features and a specification table with row headers', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    const features = screen.getByRole('region', { name: 'תכונות עיקריות' })
    expect(within(features).getAllByRole('listitem')).toHaveLength(2)

    const table = screen.getByRole('table', { name: /מפרט טכני/ })
    expect(within(table).getByRole('rowheader', { name: 'מעבד גרפי' })).toBeInTheDocument()
    expect(within(table).getByRole('cell', { name: 'NVIDIA RTX 4060 Ti' })).toBeInTheDocument()
  })

  it('opens the manufacturer site safely in a new tab', async () => {
    renderApp('/products/GV-N406', [product])
    const link = await screen.findByRole('link', { name: /לאתר היצרן/ })

    expect(link).toHaveAttribute('href', 'https://www.gigabyte.com/product')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('switches the main image from the thumbnails and exposes the pressed state', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByRole('img', { name: /תמונה 1 מתוך 2/ })).toHaveAttribute(
      'src',
      '/images/products/test/1.webp',
    )
    const second = screen.getByRole('button', { name: 'הצגת תמונה 2 מתוך 2' })
    expect(second).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(second)

    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: /תמונה 2 מתוך 2/ })).toHaveAttribute(
      'src',
      '/images/products/test/2.webp',
    )
  })

  it('does not render thumbnails for a single image', async () => {
    renderApp('/products/GV-N406', [
      makeProduct({
        ...product,
        images: { card: 'x.webp', gallery: ['images/products/test/1.webp'] },
      }),
    ])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('list', { name: 'תמונות המוצר' })).not.toBeInTheDocument()
  })

  it('shows a not-found message for an unknown product', async () => {
    renderApp('/products/NOPE', [product])

    expect(
      await screen.findByRole('heading', { level: 1, name: 'המוצר לא נמצא' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
  })

  it('shows an error with retry when the catalog cannot be loaded', async () => {
    renderApp('/products/GV-N406', new Error('down'))

    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
    expect(screen.getByRole('button', { name: 'נסו שוב' })).toBeInTheDocument()
  })

  it('links to the detail page from a product card', async () => {
    renderApp('/products', [product])

    const link = await screen.findByRole('link', { name: product.name })
    expect(link).toHaveAttribute('href', '/products/GV-N406')
  })
})

describe('ProductDetailPage: gallery buttons and saving', () => {
  const mainImage = () => screen.getByRole('img', { name: /Gigabyte RTX 4060 Ti - תמונה/ })

  it('moves through the images with the previous and next buttons, and wraps around', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    expect(mainImage()).toHaveAccessibleName(/תמונה 1 מתוך 2/)
    await userEvent.click(screen.getByRole('button', { name: 'תמונה הבאה' }))
    expect(mainImage()).toHaveAccessibleName(/תמונה 2 מתוך 2/)
    await userEvent.click(screen.getByRole('button', { name: 'תמונה הבאה' }))
    expect(mainImage()).toHaveAccessibleName(/תמונה 1 מתוך 2/)
    await userEvent.click(screen.getByRole('button', { name: 'תמונה קודמת' }))
    expect(mainImage()).toHaveAccessibleName(/תמונה 2 מתוך 2/)
  })

  it('keeps the thumbnails in sync with the buttons', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'תמונה הבאה' }))

    expect(screen.getByRole('button', { name: 'הצגת תמונה 2 מתוך 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'הצגת תמונה 1 מתוך 2' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('shows "1 / 2" left to right (and hides it from screen readers: the image says it already)', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    const counter = screen.getByText('1 / 2')
    expect(counter).toHaveAttribute('dir', 'ltr')
    expect(counter).toHaveAttribute('aria-hidden', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'תמונה הבאה' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('has no buttons and no counter for a single image', async () => {
    renderApp('/products/GV-N406', [
      makeProduct({
        ...product,
        images: { card: 'x.webp', gallery: ['images/products/test/1.webp'] },
      }),
    ])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByRole('button', { name: 'תמונה הבאה' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'תמונה קודמת' })).not.toBeInTheDocument()
    expect(screen.queryByText(/\d \/ \d/)).not.toBeInTheDocument()
  })

  it('tells how much a product on sale saves, worked out from its two prices', async () => {
    renderApp('/products/GV-N406', [
      makeProduct({ ...product, price: { current: 2678, original: 3176 } }),
    ])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.getByText(/חיסכון של/)).toHaveTextContent(/498/)
  })

  it('does not mention a saving for a product that is not on sale', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    expect(screen.queryByText(/חיסכון/)).not.toBeInTheDocument()
  })

  it('puts the price and the buy buttons in the same box', async () => {
    renderApp('/products/GV-N406', [product])
    await screen.findByRole('heading', { level: 1 })

    const box = screen.getByRole('button', { name: /הוספה לעגלה/ }).closest('.rounded-xl')!
    expect(box).toHaveTextContent(/2,138/)
    expect(within(box as HTMLElement).getByRole('button', { name: /מועדפים/ })).toBeInTheDocument()
  })
})
