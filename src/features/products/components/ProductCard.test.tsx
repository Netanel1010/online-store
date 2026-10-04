import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { makeProduct } from '@/test/fixtures'
import { ProductCard } from './ProductCard'

function renderCard(props: Parameters<typeof ProductCard>[0]) {
  return render(
    <MemoryRouter>
      <ProductCard {...props} />
    </MemoryRouter>,
  )
}

describe('ProductCard', () => {
  it('links the product name to its detail page and shows SKU, brand and price', () => {
    renderCard({ product: makeProduct({ id: 'GP-P650G', name: 'Gigabyte P650G' }) })

    expect(screen.getByRole('link', { name: 'Gigabyte P650G' })).toHaveAttribute(
      'href',
      '/products/GP-P650G',
    )
    expect(screen.getByText('GP-P650G')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Gigabyte' })).toBeInTheDocument()
    expect(screen.getByText(/1,000/)).toBeInTheDocument()
  })

  it('has exactly one link so assistive technology hears one link per product', () => {
    renderCard({ product: makeProduct() })

    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('uses the requested heading level for the product name', () => {
    renderCard({ product: makeProduct({ name: 'Card' }), headingAs: 'h2' })

    expect(screen.getByRole('heading', { level: 2, name: 'Card' })).toBeInTheDocument()
  })

  it('shows the sale badge, previous price and discount only for discounted products', () => {
    const { unmount } = renderCard({
      product: makeProduct({ price: { current: 750, original: 1000 } }),
    })
    expect(screen.getByText('מבצע')).toBeInTheDocument()
    expect(screen.getByText(/1,000/).closest('del')).toBeInTheDocument()
    expect(screen.getByText('הנחה 25%')).toBeInTheDocument()
    unmount()

    renderCard({ product: makeProduct() })
    expect(screen.queryByText('מבצע')).not.toBeInTheDocument()
    expect(document.querySelector('del')).toBeNull()
  })

  it('renders the actions slot as real controls outside of the card link', () => {
    renderCard({ product: makeProduct(), actions: <button type="button">הוספה לעגלה</button> })

    const button = screen.getByRole('button', { name: 'הוספה לעגלה' })
    expect(within(screen.getByRole('link')).queryByRole('button')).not.toBeInTheDocument()
    expect(button.closest('a')).toBeNull()
  })
})
