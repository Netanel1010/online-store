import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { resetProductCatalog } from '@/features/products/useProductCatalog'
import * as productService from '@/services/productService'
import { RootLayout } from './RootLayout'

const main = () => screen.getByRole('main')
const searchBox = () => screen.getAllByRole('searchbox', { name: 'חיפוש מוצרים' })[0]!

/**
 * The layout with a page that lands late, as a page that loads on demand does on a slow device: the
 * address changes at once, but the new page (and the layout's reaction to it) comes only when
 * `land()` is called. Until then the old page stays on screen.
 */
async function renderWithLatePage() {
  resetProductCatalog()
  vi.spyOn(productService, 'fetchProducts').mockResolvedValue([])
  let land: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    land = resolve
  })
  const LatePage = lazy(async () => {
    await gate
    return { default: () => <h1>עגלה</h1> }
  })

  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route
              index
              element={
                <>
                  <h1>דף הבית</h1>
                  <Link to="/cart">לעגלה</Link>
                  <button type="button">כפתור</button>
                </>
              }
            />
            <Route path="cart" element={<LatePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
  })
  return { land: () => act(async () => land()) }
}

describe('the focus when a new page has landed', () => {
  it('goes to the content, so that a keyboard user starts at the top of the new page', async () => {
    const { land } = await renderWithLatePage()

    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))
    await land()

    expect(await screen.findByRole('heading', { name: 'עגלה' })).toBeInTheDocument()
    expect(main()).toHaveFocus()
  })

  it('goes to the content after a search that was typed and submitted, as before', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.type(searchBox(), 'intel')
    // The search box is left through a link here: what matters is that the typing came first.
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(main()).toHaveFocus()
  })

  it('stays where the visitor is typing when they started typing after asking for the page', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))

    await userEvent.type(searchBox(), 'intel') // the page has not landed yet
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(searchBox()).toHaveFocus()
    expect(searchBox()).toHaveValue('intel')
    expect(main()).not.toHaveFocus()
  })

  it('stays in a field that was only clicked into after asking for the page', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))

    await userEvent.click(searchBox())
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(searchBox()).toHaveFocus()
  })

  it('goes to the content when the visitor typed but then left the field', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))
    await userEvent.type(searchBox(), 'intel')

    await userEvent.click(screen.getByRole('button', { name: 'כפתור' })) // asks for nothing, leaves the field
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(main()).toHaveFocus()
  })

  it('asks again with every new request: typing before the second one does not count', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))
    await userEvent.type(searchBox(), 'intel')
    // A second request for the page, after the typing.
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(main()).toHaveFocus()
  })

  it('scrolls to the top either way', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    const { land } = await renderWithLatePage()
    await userEvent.click(screen.getByRole('link', { name: 'לעגלה' }))
    await userEvent.type(searchBox(), 'intel')
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
  })
})
