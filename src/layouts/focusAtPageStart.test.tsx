import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { lazy, useEffect } from 'react'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router'
import * as productService from '@/services/productService'
import { RootLayout } from './RootLayout'

/**
 * A field whose Enter asks for the page by itself, with no click and no form: this is how the search
 * box opens the product that is highlighted in its list of suggestions.
 */
function EnterOpensCart() {
  const navigate = useNavigate()
  return (
    <input
      aria-label="שדה"
      onKeyDown={(event) => {
        if (event.key === 'Enter') navigate('/cart')
      }}
    />
  )
}

/** Hands the test the router's navigate function, to go back the way the browser's button does. */
function NavigateHandle({ onReady }: { onReady: (navigate: (delta: number) => void) => void }) {
  const navigate = useNavigate()
  useEffect(() => {
    onReady((delta) => void navigate(delta))
  })
  return null
}

const main = () => screen.getByRole('main')
const searchBox = () => screen.getAllByRole('searchbox', { name: 'חיפוש מוצרים' })[0]!

/**
 * The layout with a page that lands late, as a page that loads on demand does on a slow device: the
 * address changes at once, but the new page (and the layout's reaction to it) comes only when
 * `land()` is called. Until then the old page stays on screen. With `cameFromCart` the visitor has been
 * to the late page before, so that going back leads to it.
 */
async function renderWithLatePage({ cameFromCart = false } = {}) {
  vi.spyOn(productService, 'fetchProductsByIds').mockResolvedValue([])
  let land: () => void = () => undefined
  let navigate: (delta: number) => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    land = resolve
  })
  const LatePage = lazy(async () => {
    await gate
    return { default: () => <h1>עגלה</h1> }
  })

  await act(async () => {
    render(
      <MemoryRouter
        initialEntries={cameFromCart ? ['/cart', '/'] : ['/']}
        initialIndex={cameFromCart ? 1 : 0}
      >
        <NavigateHandle
          onReady={(go) => {
            navigate = go
          }}
        />
        {/* Outside the pages, like the search box in the header: it stays when a page lands. */}
        <EnterOpensCart />
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
  return {
    land: () => act(async () => land()),
    goBack: () => act(async () => navigate(-1)),
  }
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

  it('goes to the content after an Enter in the field that asked for the page', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.type(screen.getByRole('textbox', { name: 'שדה' }), 'abc{Enter}')

    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(main()).toHaveFocus()
  })

  it('stays in a field that is typed in after that Enter', async () => {
    const { land } = await renderWithLatePage()
    await userEvent.type(screen.getByRole('textbox', { name: 'שדה' }), 'abc{Enter}')

    await userEvent.type(screen.getByRole('textbox', { name: 'שדה' }), 'def')
    await land()

    await screen.findByRole('heading', { name: 'עגלה' })
    expect(screen.getByRole('textbox', { name: 'שדה' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'שדה' })).toHaveValue('abcdef')
  })

  it('goes to the content after the browser back or forward button, even with text typed', async () => {
    const { land, goBack } = await renderWithLatePage({ cameFromCart: true })
    await userEvent.type(searchBox(), 'intel')

    // Back is neither a click nor a form, and the router renders for it inside the event itself.
    await goBack()
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
