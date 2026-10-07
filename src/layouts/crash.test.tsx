import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '@/app/App'
import { renderApp } from '@/test/renderApp'
import { makeProduct } from '@/test/fixtures'

// The home page is replaced by one that fails to render, as long as `home.fails` is set.
const home = { fails: true }
vi.mock('@/pages/HomePage', () => ({
  HomePage: () => {
    if (home.fails) throw new Error('home page exploded')
    return <h1>home page works</h1>
  },
}))

const appRoutes = { fails: false }
vi.mock('@/app/routes', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/app/routes')>()
  return {
    ...original,
    AppRoutes: () => {
      if (appRoutes.fails) throw new Error('the whole app exploded')
      return <original.AppRoutes />
    },
  }
})

beforeEach(() => {
  home.fails = true
  appRoutes.fails = false
  // React and the boundary report a caught error to the console: expected here.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('a page that fails to render', () => {
  it('shows a message inside the layout instead of a blank screen: the header and the footer stay', () => {
    renderApp('/', [makeProduct()])

    expect(screen.getByRole('alert')).toHaveTextContent('משהו השתבש בעמוד הזה')
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.queryByText('home page exploded')).not.toBeInTheDocument()
  })

  it('goes away when the visitor goes to another page', async () => {
    const user = userEvent.setup()
    renderApp('/', [makeProduct()])

    await user.click(screen.getAllByRole('link', { name: 'מוצרים' })[0]!)

    await waitFor(() => expect(screen.queryByText('משהו השתבש בעמוד הזה')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('כל המוצרים')
  })

  it('can be tried again once the cause is gone', async () => {
    const user = userEvent.setup()
    renderApp('/', [makeProduct()])
    expect(screen.getByRole('alert')).toBeInTheDocument()

    home.fails = false
    await user.click(screen.getByRole('button', { name: 'נסו שוב' }))

    expect(screen.getByRole('heading', { name: 'home page works' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the cart and favorites of the visitor', async () => {
    localStorage.setItem('online-store:cart', JSON.stringify({ state: { items: [] }, version: 1 }))
    renderApp('/', [makeProduct()])

    expect(screen.getByRole('alert')).toHaveTextContent('העגלה והמועדפים לא נפגעו')
    expect(screen.getByRole('link', { name: /^עגלת קניות/ })).toBeInTheDocument()
  })
})

describe('the whole app failing', () => {
  it('shows the last-resort screen instead of a blank page', () => {
    appRoutes.fails = true

    render(<App />)

    expect(screen.getByRole('alert')).toHaveTextContent('משהו השתבש בעמוד הזה')
    expect(screen.getByRole('button', { name: 'רענון העמוד' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לדף הבית' })).toBeInTheDocument()
  })
})
