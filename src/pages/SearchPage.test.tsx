import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const amd = makeProduct({
  id: 'AMD-1',
  name: 'AMD Ryzen 7 9700X',
  brand: 'amd',
  category: 'cpu',
  price: { current: 1858 },
})
const intelCpu = makeProduct({
  id: 'INTEL-1',
  name: 'Intel Core Ultra 7 265',
  brand: 'intel',
  category: 'cpu',
  price: { current: 1785 },
})
const intelCooler = makeProduct({
  id: 'INTEL-2',
  name: 'Intel Cooler',
  brand: 'intel',
  category: 'cooler',
  price: { current: 100 },
})
const catalog = [amd, intelCpu, intelCooler]

const url = () => screen.getByTestId('url').textContent
// The header form comes first in the DOM (the mobile menu repeats it, hidden by CSS in browsers).
const headerSearchbox = () => screen.getAllByRole('searchbox', { name: 'חיפוש מוצרים' })[0]!
const headerSubmit = () => screen.getAllByRole('button', { name: 'חיפוש' })[0]!
const cardNames = () =>
  screen
    .getAllByRole('article')
    .map((card) => within(card).getByRole('heading', { level: 2 }).textContent)

describe('header search', () => {
  it('submits to the search results page and shows the matching products', async () => {
    renderApp('/', catalog)

    await userEvent.type(headerSearchbox(), 'intel{Enter}')

    expect(url()).toBe('/search?q=intel')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'תוצאות חיפוש עבור “intel”' }),
    ).toBeInTheDocument()
    expect(cardNames()).toEqual(['Intel Core Ultra 7 265', 'Intel Cooler'])
  })

  it('also submits with the search button and encodes the text in the URL', async () => {
    renderApp('/', catalog)

    await userEvent.type(headerSearchbox(), 'core ultra')
    await userEvent.click(headerSubmit())

    expect(url()).toBe('/search?q=core+ultra')
    expect(await screen.findAllByRole('article')).toHaveLength(1)
  })

  it('does nothing for an empty or blank search', async () => {
    renderApp('/products', catalog)

    await userEvent.type(headerSearchbox(), '   {Enter}')

    expect(url()).toBe('/products')
  })

  it('shows the searched text in the box on the results page', async () => {
    renderApp('/search?q=amd', catalog)
    await screen.findAllByRole('article')

    expect(headerSearchbox()).toHaveValue('amd')
  })

  it('keeps the box in step with the URL when navigating back', async () => {
    renderApp('/search?q=amd', catalog)
    await screen.findAllByRole('article')

    await userEvent.clear(headerSearchbox())
    await userEvent.type(headerSearchbox(), 'intel{Enter}')
    expect(headerSearchbox()).toHaveValue('intel')

    await userEvent.click(screen.getByRole('button', { name: 'test-back', hidden: true }))

    expect(url()).toBe('/search?q=amd')
    expect(headerSearchbox()).toHaveValue('amd')
    expect(cardNames()).toEqual(['AMD Ryzen 7 9700X'])
  })
})

describe('search results', () => {
  it('is case-insensitive and matches the brand and the category name', async () => {
    renderApp('/search?q=AMD', catalog)
    expect(await screen.findAllByRole('article')).toHaveLength(1)
  })

  it('matches every word (AND)', async () => {
    renderApp('/search?q=intel+cooler', catalog)

    await screen.findAllByRole('article')
    expect(cardNames()).toEqual(['Intel Cooler'])
  })

  it('matches by SKU', async () => {
    renderApp('/search?q=amd-1', catalog)

    await screen.findAllByRole('article')
    expect(cardNames()).toEqual(['AMD Ryzen 7 9700X'])
  })

  it('shows a proper empty state with a way out when nothing matches', async () => {
    renderApp('/search?q=banana', catalog)

    expect(await screen.findByRole('heading', { name: 'לא נמצאו מוצרים' })).toBeInTheDocument()
    expect(screen.getByText('לא נמצאו מוצרים עבור “banana”.')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')
  })

  it('prompts for a search text when there is none', () => {
    renderApp('/search', catalog)

    expect(screen.getByRole('heading', { level: 1, name: 'חיפוש' })).toBeInTheDocument()
    expect(screen.getByText('מה מחפשים?')).toBeInTheDocument()
  })

  it('treats a blank text like no text', () => {
    renderApp('/search?q=%20%20', catalog)

    expect(screen.getByText('מה מחפשים?')).toBeInTheDocument()
  })

  it('shows the text as plain text, never as HTML', async () => {
    renderApp(`/search?q=${encodeURIComponent('<img src=x onerror=alert(1)>')}`, catalog)

    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('<img src=x onerror=alert(1)>')
    expect(document.querySelector('main img[src="x"]')).toBeNull()
  })

  it('shows a loading state, and an error with retry when the catalog fails', async () => {
    const { unmount } = renderApp('/search?q=amd', catalog)
    expect(screen.getByText('טוען מוצרים…')).toBeInTheDocument()
    await screen.findAllByRole('article')
    unmount()

    renderApp('/search?q=amd', new Error('down'))
    expect(await screen.findByRole('alert')).toHaveTextContent('משהו השתבש')
  })
})

describe('search combined with filters and sort', () => {
  it('ANDs a brand filter with the search text', async () => {
    renderApp('/search?q=7', catalog) // matches both "Ryzen 7" and "Ultra 7"
    await screen.findAllByRole('article')
    expect(cardNames()).toHaveLength(2)

    await userEvent.click(screen.getByRole('checkbox', { name: /Intel/ }))

    expect(cardNames()).toEqual(['Intel Core Ultra 7 265'])
    expect(url()).toBe('/search?q=7&brand=intel')
  })

  it('offers only the brands that appear in the results, with counts', async () => {
    renderApp('/search?q=cooler', catalog)
    await screen.findAllByRole('article')

    // Only Intel has a cooler, so there is no brand choice to make.
    expect(screen.queryByRole('group', { name: 'מותג' })).not.toBeInTheDocument()
  })

  it('keeps the search text when the filters are cleared', async () => {
    renderApp('/search?q=intel&brand=intel&sort=price-asc', catalog)
    await screen.findAllByRole('article')

    await userEvent.click(screen.getByRole('button', { name: 'ניקוי סינון' }))

    expect(url()).toBe('/search?q=intel&sort=price-asc')
    expect(cardNames()).toHaveLength(2)
  })

  it('sorts the results and records the sort next to the search text', async () => {
    renderApp('/search?q=intel', catalog)
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'מיון' }),
      'price-asc',
    )

    expect(cardNames()).toEqual(['Intel Cooler', 'Intel Core Ultra 7 265'])
    expect(url()).toBe('/search?q=intel&sort=price-asc')
  })

  it('reports an empty combination of search and filters and lets the visitor clear it', async () => {
    renderApp('/search?q=amd&brand=intel', catalog)

    expect(await screen.findByRole('heading', { name: 'לא נמצאו מוצרים' })).toBeInTheDocument()
    expect(screen.getByText('לא נמצאו מוצרים עבור “amd” עם הסינון שנבחר.')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'ניקוי סינון' }).at(-1)!)
    expect(url()).toBe('/search?q=amd')
    expect(cardNames()).toEqual(['AMD Ryzen 7 9700X'])
  })
})

describe('search ignored where there is no search box', () => {
  it('does not apply ?q on the products page', async () => {
    renderApp('/products?q=amd', catalog)

    expect(await screen.findAllByRole('article')).toHaveLength(3)
  })
})

describe('search in the mobile menu', () => {
  it('has its own search form, and submitting closes the menu', async () => {
    renderApp('/', catalog)
    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))
    const menu = screen.getByRole('dialog', { name: 'תפריט ראשי' })
    expect(menu).toHaveAttribute('open')

    await userEvent.type(within(menu).getByRole('searchbox'), 'amd{Enter}')

    expect(url()).toBe('/search?q=amd')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the menu when searching again from the results page', async () => {
    renderApp('/search?q=amd', catalog)
    await screen.findAllByRole('article')
    await userEvent.click(screen.getByRole('button', { name: 'פתיחת תפריט' }))
    const menu = screen.getByRole('dialog', { name: 'תפריט ראשי' })

    const box = within(menu).getByRole('searchbox')
    await userEvent.clear(box)
    await userEvent.type(box, 'intel{Enter}')

    expect(url()).toBe('/search?q=intel')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
