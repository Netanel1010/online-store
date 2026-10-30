import { screen, within } from '@testing-library/react'
import { BRAND_IDS, BRANDS } from '@/features/products/brands'
import { brandListingPath } from '@/features/products/brandPath'
import { renderApp } from '@/test/renderApp'

async function renderStrip() {
  renderApp('/', [])
  return screen.findByRole('region', { name: 'מותגים' })
}

describe('BrandStrip', () => {
  it('has one link for every brand, to the listing of that brand', async () => {
    const strip = await renderStrip()

    expect(within(strip).getAllByRole('link')).toHaveLength(BRAND_IDS.length)
    for (const id of BRAND_IDS) {
      expect(
        within(strip).getByRole('link', { name: `מוצרי ${BRANDS[id].name}` }),
        id,
      ).toHaveAttribute('href', brandListingPath(id))
    }
  })

  it('names each link once and keeps its logo out of the accessibility tree', async () => {
    const strip = await renderStrip()

    expect(within(strip).queryAllByRole('img')).toHaveLength(0)
    for (const link of within(strip).getAllByRole('link')) {
      const logo = link.querySelector('img')
      expect(logo, link.getAttribute('aria-label') ?? '').toHaveAttribute('alt', '')
      // The name is the label alone: no visible text, no second source of a name.
      expect(link).toHaveTextContent('')
      expect(link).not.toHaveAttribute('title')
      expect(link).not.toHaveAttribute('aria-labelledby')
    }
  })
})
