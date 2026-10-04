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
  price: { current: 1858 },
  specs: [spec(SOCKET, 'AM5'), spec(MEMORY, 'DDR5')],
})
const intelNew = makeProduct({
  id: 'INTEL-1',
  name: 'Intel Core Ultra 7 265',
  brand: 'intel',
  category: 'cpu',
  price: { current: 1785 },
  specs: [spec(SOCKET, 'LGA 1851'), spec(MEMORY, 'DDR5')],
})
const intelOld = makeProduct({
  id: 'INTEL-2',
  name: 'Intel Core i9 14900KF',
  brand: 'intel',
  category: 'cpu',
  price: { current: 2069 },
  specs: [spec(SOCKET, 'LGA 1700'), spec(MEMORY, 'DDR4')],
})
const gpu = makeProduct({ id: 'GPU-1', name: 'Gigabyte RTX', brand: 'gigabyte', category: 'gpu' })
const catalog = [amd, intelNew, intelOld, gpu]

const url = () => screen.getByTestId('url').textContent
const names = () =>
  screen.getAllByRole('heading', { level: 2 }).flatMap((h) => {
    const text = h.textContent ?? ''
    return /^(AMD|Intel|Gigabyte)/.test(text) ? [text] : []
  })
const checkbox = (name: string | RegExp) => screen.getByRole('checkbox', { name })
const back = () => userEvent.click(screen.getByRole('button', { name: 'test-back', hidden: true }))
const forward = () =>
  userEvent.click(screen.getByRole('button', { name: 'test-forward', hidden: true }))
const status = () =>
  screen.getByText(/מוצרים$|מוצר אחד|לא נמצאו מוצרים$/, { selector: 'p[role="status"]' })

describe('filters derived from the data', () => {
  it('offers a brand filter with counts on the category page', async () => {
    renderApp('/category/cpu', catalog)
    const brands = await screen.findByRole('group', { name: 'מותג' })

    expect(within(brands).getByRole('checkbox', { name: /AMD/ })).toHaveAccessibleName(/AMD.*1/)
    expect(within(brands).getByRole('checkbox', { name: /Intel/ })).toHaveAccessibleName(/Intel.*2/)
    expect(within(brands).queryByRole('checkbox', { name: /Gigabyte/ })).not.toBeInTheDocument()
  })

  it('offers specification filters derived from the category products', async () => {
    renderApp('/category/cpu', catalog)

    const socket = await screen.findByRole('group', { name: SOCKET })
    expect(
      within(socket)
        .getAllByRole('checkbox')
        .map((c) => c.getAttribute('aria-label') ?? c.parentElement?.textContent),
    ).toEqual(['AM5(1)', 'LGA 1700(1)', 'LGA 1851(1)'])
    expect(screen.getByRole('group', { name: MEMORY })).toBeInTheDocument()
  })

  it('offers only the brand filter (no specification filters) on the all-products page', async () => {
    renderApp('/products', catalog)

    expect(await screen.findByRole('group', { name: 'מותג' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: SOCKET })).not.toBeInTheDocument()
  })
})

describe('filtering through the URL', () => {
  it('filters by brand, updates the count and writes the filter to the URL', async () => {
    renderApp('/category/cpu', catalog)
    await screen.findByRole('group', { name: 'מותג' })
    expect(status()).toHaveTextContent('3 מוצרים')

    await userEvent.click(checkbox(/Intel/))

    expect(names()).toEqual(['Intel Core Ultra 7 265', 'Intel Core i9 14900KF'])
    expect(status()).toHaveTextContent('2 מוצרים')
    expect(url()).toBe('/category/cpu?brand=intel')
    expect(checkbox(/Intel/)).toBeChecked()
  })

  it('ORs values within a group', async () => {
    renderApp('/category/cpu', catalog)
    await screen.findByRole('group', { name: SOCKET })

    await userEvent.click(checkbox(/AM5/))
    await userEvent.click(checkbox(/LGA 1700/))

    expect(names()).toEqual(['AMD Ryzen 7 9700X', 'Intel Core i9 14900KF'])
  })

  it('ANDs across groups and disables options that would return nothing', async () => {
    renderApp('/category/cpu', catalog)
    await screen.findByRole('group', { name: 'מותג' })

    await userEvent.click(checkbox(/Intel/))
    // AM5 only exists on AMD, so with Intel ticked it can no longer be chosen.
    expect(checkbox(/AM5/)).toBeDisabled()
    expect(checkbox(/LGA 1851/)).toBeEnabled()

    await userEvent.click(checkbox(/LGA 1851/))
    expect(names()).toEqual(['Intel Core Ultra 7 265'])

    // Intel + LGA 1851 + DDR4 matches nothing, so DDR4 is offered as disabled, not as a dead end.
    expect(checkbox(/DDR4/)).toBeDisabled()
  })

  it('clears every filter and leaves a clean URL', async () => {
    renderApp(
      '/category/cpu?brand=intel&s.%D7%AA%D7%95%D7%A9%D7%91%D7%AA%20%D7%9E%D7%A2%D7%91%D7%93=LGA%201851',
      catalog,
    )
    await screen.findByRole('group', { name: 'מותג' })

    await userEvent.click(screen.getByRole('button', { name: 'ניקוי סינון' }))

    expect(url()).toBe('/category/cpu')
    expect(names()).toHaveLength(3)
    expect(checkbox(/Intel/)).not.toBeChecked()
  })

  it('shows the active filters as removable chips', async () => {
    renderApp('/category/cpu?brand=intel&brand=amd', catalog)
    const chips = await screen.findByRole('list', { name: 'מסננים פעילים' })

    await userEvent.click(within(chips).getByRole('button', { name: 'הסרת מסנן מותג: AMD' }))

    expect(url()).toBe('/category/cpu?brand=intel')
    expect(names()).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'ניקוי הכל' }))
    expect(url()).toBe('/category/cpu')
  })

  it('offers a way out when the filters leave no results', async () => {
    // Both values are real, but AMD has no LGA 1851 CPU: a valid combination with no products.
    renderApp(
      '/category/cpu?brand=amd&s.%D7%AA%D7%95%D7%A9%D7%91%D7%AA%20%D7%9E%D7%A2%D7%91%D7%93=LGA%201851',
      catalog,
    )

    expect(await screen.findByRole('heading', { name: 'לא נמצאו מוצרים' })).toBeInTheDocument()
    expect(screen.getByText('אין מוצרים שמתאימים לסינון שנבחר.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute('href', '/products')

    await userEvent.click(screen.getAllByRole('button', { name: 'ניקוי סינון' }).at(-1)!)
    expect(names()).toHaveLength(3)
    expect(url()).toBe('/category/cpu')
  })
})

describe('URL state: reload, sharing, history', () => {
  it('reproduces the same view from a shared URL (filters, chips and sort)', async () => {
    renderApp('/category/cpu?brand=intel&sort=price-desc', catalog)
    await screen.findByRole('group', { name: 'מותג' })

    expect(checkbox(/Intel/)).toBeChecked()
    expect(names()).toEqual(['Intel Core i9 14900KF', 'Intel Core Ultra 7 265'])
    expect(screen.getByRole('combobox', { name: 'מיון' })).toHaveValue('price-desc')
    expect(screen.getByRole('button', { name: 'הסרת מסנן מותג: Intel' })).toBeInTheDocument()
  })

  it('ignores invalid parameters instead of failing', async () => {
    renderApp('/category/cpu?brand=nope&sort=chaos&s.=x&junk=1', catalog)
    await screen.findByRole('group', { name: 'מותג' })

    expect(names()).toHaveLength(3)
    expect(screen.getByRole('combobox', { name: 'מיון' })).toHaveValue('default')
    expect(screen.queryByRole('list', { name: 'מסננים פעילים' })).not.toBeInTheDocument()
  })

  it('steps through filter changes with the browser back and forward buttons', async () => {
    renderApp('/category/cpu', catalog)
    await screen.findByRole('group', { name: 'מותג' })

    await userEvent.click(checkbox(/Intel/))
    await userEvent.click(checkbox(/LGA 1851/))
    expect(url()).toContain('brand=intel')
    expect(names()).toEqual(['Intel Core Ultra 7 265'])

    await back()
    expect(names()).toEqual(['Intel Core Ultra 7 265', 'Intel Core i9 14900KF'])
    expect(checkbox(/LGA 1851/)).not.toBeChecked()

    await back()
    expect(url()).toBe('/category/cpu')
    expect(names()).toHaveLength(3)

    await forward()
    expect(url()).toBe('/category/cpu?brand=intel')
    expect(checkbox(/Intel/)).toBeChecked()
  })

  it('does not carry filters over to another category', async () => {
    renderApp('/category/cpu?brand=intel', catalog)
    await screen.findByRole('group', { name: 'מותג' })

    const categoryNav = screen.getByRole('navigation', { name: 'סינון לפי קטגוריה' })
    await userEvent.click(within(categoryNav).getByRole('link', { name: /כרטיסי מסך/ }))

    expect(url()).toBe('/category/gpu')
  })
})

describe('sorting', () => {
  it('sorts by price in both directions and records the sort in the URL', async () => {
    renderApp('/category/cpu', catalog)
    const sort = await screen.findByRole('combobox', { name: 'מיון' })

    await userEvent.selectOptions(sort, 'price-asc')
    expect(names()).toEqual([
      'Intel Core Ultra 7 265',
      'AMD Ryzen 7 9700X',
      'Intel Core i9 14900KF',
    ])
    expect(url()).toBe('/category/cpu?sort=price-asc')

    await userEvent.selectOptions(sort, 'price-desc')
    expect(names()).toEqual([
      'Intel Core i9 14900KF',
      'AMD Ryzen 7 9700X',
      'Intel Core Ultra 7 265',
    ])
  })

  it('sorts by name in both directions', async () => {
    renderApp('/category/cpu', catalog)
    const sort = await screen.findByRole('combobox', { name: 'מיון' })

    await userEvent.selectOptions(sort, 'name-asc')
    expect(names()).toEqual([
      'AMD Ryzen 7 9700X',
      'Intel Core i9 14900KF',
      'Intel Core Ultra 7 265',
    ])

    await userEvent.selectOptions(sort, 'name-desc')
    expect(names()).toEqual([
      'Intel Core Ultra 7 265',
      'Intel Core i9 14900KF',
      'AMD Ryzen 7 9700X',
    ])
  })

  it('returns to a clean URL when the default order is chosen again', async () => {
    renderApp('/category/cpu?sort=price-asc', catalog)
    const sort = await screen.findByRole('combobox', { name: 'מיון' })

    await userEvent.selectOptions(sort, 'default')

    expect(url()).toBe('/category/cpu')
  })

  it('applies the sort on top of the filters', async () => {
    renderApp('/category/cpu?brand=intel', catalog)
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'מיון' }),
      'price-asc',
    )

    expect(names()).toEqual(['Intel Core Ultra 7 265', 'Intel Core i9 14900KF'])
    expect(url()).toBe('/category/cpu?brand=intel&sort=price-asc')
  })
})

describe('mobile filter toggle', () => {
  it('shows an expandable filter button with the number of active filters', async () => {
    renderApp('/category/cpu?brand=intel', catalog)
    const toggle = await screen.findByRole('button', { name: 'סינון (1)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAttribute('aria-controls', 'filter-panel')
  })
})
