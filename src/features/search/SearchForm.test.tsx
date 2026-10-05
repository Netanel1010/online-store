import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const make = (id: string, name: string, extra = {}) =>
  makeProduct({
    id,
    name,
    fullName: name,
    brand: 'corsair',
    category: 'case',
    price: { current: 100 },
    ...extra,
  })

// Seven products that match "corsair", so the limit of five can be seen.
const corsairs = Array.from({ length: 7 }, (_, index) =>
  make(`C-${index + 1}`, `Corsair Case ${index + 1}`, { price: { current: 100 + index } }),
)
const rtx = make('GV-4070', 'Gigabyte RTX 4070 Gaming', { brand: 'gigabyte', category: 'gpu' })
const catalog = [...corsairs, rtx]

const url = () => screen.getByTestId('url').textContent
// The header box comes first in the document (the mobile menu repeats it, hidden by CSS).
const box = () => screen.getAllByRole('searchbox', { name: 'חיפוש מוצרים' })[0]!
const options = () => screen.queryAllByRole('option')
const optionNames = () =>
  options().map(
    (option) =>
      /Corsair Case \d|Gigabyte RTX 4070 Gaming/.exec(option.textContent ?? '')?.[0] ?? 'all',
  )

async function start(path = '/') {
  renderApp(path, catalog)
  // The suggestions need the loaded catalog.
  await screen.findAllByRole('searchbox')
  await screen.findByRole('link', { name: 'עגלת קניות' })
}

describe('search suggestions', () => {
  it('lists up to five matching products while typing, with a last row for all the results', async () => {
    await start()

    await userEvent.type(box(), 'corsair')

    expect(screen.getByRole('listbox', { name: 'הצעות לחיפוש' })).toBeInTheDocument()
    expect(options()).toHaveLength(6) // five products and "all results"
    expect(options().at(-1)).toHaveTextContent('הצגת כל התוצאות עבור “corsair”')
    expect(url()).toBe('/') // nothing was submitted
  })

  it('shows what helps to choose: the name, brand and category, and the price', async () => {
    await start()

    await userEvent.type(box(), '4070')

    const [first] = options()
    expect(first).toHaveTextContent('Gigabyte RTX 4070 Gaming')
    expect(first).toHaveTextContent('Gigabyte · כרטיסי מסך')
    expect(first).toHaveTextContent(/100/)
  })

  it('updates the list as the text changes', async () => {
    await start()

    await userEvent.type(box(), 'rtx')
    expect(optionNames()).toEqual(['Gigabyte RTX 4070 Gaming', 'all'])

    await userEvent.clear(box())
    await userEvent.type(box(), 'corsair case 3')
    expect(optionNames()).toEqual(['Corsair Case 3', 'all'])
  })

  it('offers nothing for an empty text, a single character or a text that matches nothing', async () => {
    await start()

    await userEvent.click(box())
    expect(options()).toHaveLength(0)

    await userEvent.type(box(), 'c')
    expect(options()).toHaveLength(0)

    await userEvent.clear(box())
    await userEvent.type(box(), 'banana')
    expect(options()).toHaveLength(0)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens the product when a suggestion is clicked, and empties the box', async () => {
    await start()
    await userEvent.type(box(), '4070')

    await userEvent.click(options()[0]!)

    expect(url()).toBe('/products/GV-4070')
    expect(box()).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('goes to the results page from the last row', async () => {
    await start()
    await userEvent.type(box(), 'corsair')

    await userEvent.click(options().at(-1)!)

    expect(url()).toBe('/search?q=corsair')
  })

  it('still searches with Enter when nothing is highlighted', async () => {
    await start()

    await userEvent.type(box(), 'corsair{Enter}')

    expect(url()).toBe('/search?q=corsair')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('search suggestions: keyboard', () => {
  it('moves a highlight with the arrow keys and keeps the focus in the box', async () => {
    await start()
    await userEvent.type(box(), 'corsair')

    await userEvent.keyboard('{ArrowDown}')
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
    expect(box()).toHaveAttribute('aria-activedescendant', options()[0]!.id)
    expect(box()).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(options()[2]).toHaveAttribute('aria-selected', 'true')
    expect(
      options().filter((option) => option.getAttribute('aria-selected') === 'true'),
    ).toHaveLength(1)

    await userEvent.keyboard('{ArrowUp}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('loops through the rows and the typed text (nothing highlighted)', async () => {
    await start()
    await userEvent.type(box(), 'rtx') // one product and "all results"

    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')
    expect(box()).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{ArrowUp}')
    expect(options()[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the highlighted product with Enter', async () => {
    await start()
    await userEvent.type(box(), 'corsair')

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(url()).toBe('/products/C-2')
  })

  it('opens the results with Enter on the last row', async () => {
    await start()
    await userEvent.type(box(), 'rtx')

    await userEvent.keyboard('{ArrowUp}{Enter}')

    expect(url()).toBe('/search?q=rtx')
  })

  it('opens the list again with an arrow key after Escape closed it', async () => {
    await start()
    await userEvent.type(box(), 'corsair')

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(box()).toHaveValue('corsair') // the text stays
    expect(box()).toHaveFocus()

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(options()[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('forgets the highlight when the text changes', async () => {
    await start()
    await userEvent.type(box(), 'corsair')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    await userEvent.type(box(), ' case')

    expect(box()).not.toHaveAttribute('aria-activedescendant')
  })

  it('closes when the focus leaves the box and opens again when it returns', async () => {
    await start()
    await userEvent.type(box(), 'corsair')

    await userEvent.tab() // the clear button: still inside the search box
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.tab() // the search button
    await userEvent.tab() // out of the box
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await userEvent.click(box())
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })
})

describe('search suggestions: accessibility', () => {
  it('keeps the box a named searchbox and describes the list it controls', async () => {
    await start()
    expect(box()).not.toHaveAttribute('aria-controls')

    await userEvent.type(box(), 'corsair')

    expect(box()).toHaveAttribute('aria-autocomplete', 'list')
    expect(box()).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(screen.getAllByRole('option').every((option) => option.id !== '')).toBe(true)
  })

  it('announces how many suggestions there are, and says nothing when there are none', async () => {
    await start()
    const announcement = () =>
      screen
        .getAllByRole('status')
        .map((status) => status.textContent)
        .find((text) => text?.includes('הצעות'))

    await userEvent.type(box(), 'corsair')
    expect(announcement()).toContain('5 הצעות')

    await userEvent.clear(box())
    expect(announcement()).toBeUndefined()
  })
})
