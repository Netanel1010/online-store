import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeProduct } from '@/test/fixtures'
import { renderApp } from '@/test/renderApp'

const spec = (label: string, value: string) => ({ label, value })
const SOCKET = 'תושבת מעבד'
const MEMORY = 'תמיכה בזכרון'

const amd = makeProduct({
  id: 'AMD-1',
  name: 'AMD Ryzen 7 9700X',
  brand: 'amd',
  category: 'cpu',
  specs: [spec(SOCKET, 'AM5'), spec(MEMORY, 'DDR5')],
})
const intelNew = makeProduct({
  id: 'INTEL-1',
  name: 'Intel Core Ultra 7 265',
  brand: 'intel',
  category: 'cpu',
  specs: [spec(SOCKET, 'LGA 1851'), spec(MEMORY, 'DDR5')],
})
const intelOld = makeProduct({
  id: 'INTEL-2',
  name: 'Intel Core i9 14900KF',
  brand: 'intel',
  category: 'cpu',
  specs: [spec(SOCKET, 'LGA 1700'), spec(MEMORY, 'DDR4')],
})
const catalog = [amd, intelNew, intelOld]

const socketKey = encodeURIComponent(`s.${SOCKET}`)
const memoryKey = encodeURIComponent(`s.${MEMORY}`)
const url = () => screen.getByTestId('url').textContent
const names = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent ?? '')
    .filter((text) => /^(AMD|Intel)/.test(text))
const activeChips = () => screen.queryByRole('list', { name: 'מסננים פעילים' })
const brandFilter = () => screen.findByRole('group', { name: 'מותג' })

describe('unknown specification filters in the URL', () => {
  it('ignores an unknown specification label instead of returning no products', async () => {
    renderApp(`/category/cpu?s.fake=value&s.${encodeURIComponent('משהו_שלא_קיים')}=abc`, catalog)
    await brandFilter()

    expect(names()).toHaveLength(3)
    expect(screen.getByText('3 מוצרים', { selector: 'p[role="status"]' })).toBeInTheDocument()
    expect(activeChips()).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^סינון \(/ })).not.toBeInTheDocument()
  })

  it('ignores an unknown value of a known label', async () => {
    renderApp(`/category/cpu?${socketKey}=Nope`, catalog)
    await brandFilter()

    expect(names()).toHaveLength(3)
    expect(activeChips()).not.toBeInTheDocument()
  })

  it('still applies a valid label and value', async () => {
    renderApp(`/category/cpu?${socketKey}=${encodeURIComponent('LGA 1851')}`, catalog)
    await brandFilter()

    expect(names()).toEqual(['Intel Core Ultra 7 265'])
    expect(screen.getByRole('checkbox', { name: /LGA 1851/ })).toBeChecked()
    expect(
      screen.getByRole('button', { name: `הסרת מסנן ${SOCKET}: LGA 1851` }),
    ).toBeInTheDocument()
  })

  it('keeps only the valid parts of a mixed URL', async () => {
    renderApp(
      `/category/cpu?${socketKey}=AM5&${socketKey}=Nope&${memoryKey}=Nope&s.fake=value&brand=amd`,
      catalog,
    )
    await brandFilter()

    expect(names()).toEqual(['AMD Ryzen 7 9700X'])
    const chips = activeChips()!
    expect(within(chips).getAllByRole('button', { name: /^הסרת מסנן/ })).toHaveLength(2)
    expect(
      within(chips).getByRole('button', { name: `הסרת מסנן ${SOCKET}: AM5` }),
    ).toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: 'הסרת מסנן מותג: AMD' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /AM5/ })).toBeChecked()
  })

  it('drops the invalid parts from the URL at the next change and keeps the valid ones', async () => {
    renderApp(`/category/cpu?${socketKey}=AM5&${socketKey}=Nope&s.fake=value`, catalog)
    await brandFilter()

    // AM5 is AMD-only, so AMD is the brand that can still be ticked.
    await userEvent.click(screen.getByRole('checkbox', { name: /AMD/ }))

    // Compare the parsed parameters: the raw string encodes spaces as "+".
    const [pathname, search] = url()!.split('?')
    expect(pathname).toBe('/category/cpu')
    expect([...new URLSearchParams(search)]).toEqual([
      ['brand', 'amd'],
      [`s.${SOCKET}`, 'AM5'],
    ])
  })

  it('ignores specification filters on pages that offer none', async () => {
    renderApp(`/products?${socketKey}=AM5&s.fake=value`, catalog)

    expect(await screen.findAllByRole('article')).toHaveLength(3)
    expect(activeChips()).not.toBeInTheDocument()
  })

  it('ignores a label that exists in the data but is not offered as a filter', async () => {
    // With six products having the label, values that never repeat are not offered as a filter.
    const many = Array.from({ length: 6 }, (_, index) =>
      makeProduct({
        id: `MANY-${index}`,
        name: `Intel Many ${index}`,
        brand: 'intel',
        category: 'cpu',
        specs: [spec('מחיר אחרון', `unique-${index}`), spec('בחירה', index % 2 ? 'p' : 'q')],
      }),
    )
    renderApp(`/category/cpu?${encodeURIComponent('s.מחיר אחרון')}=unique-1`, many)
    await screen.findAllByRole('article')

    expect(screen.getAllByRole('article')).toHaveLength(6)
    expect(activeChips()).not.toBeInTheDocument()
  })
})
