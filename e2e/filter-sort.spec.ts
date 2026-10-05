import type { Page } from '@playwright/test'
import { catalog, SOCKET_LABEL, specValue } from './support/catalog'
import { cardNames } from './support/helpers'
import { expect, test } from './support/test'

const cpus = catalog.filter((product) => product.category === 'cpu')
const byName = new Map(catalog.map((product) => [product.name, product]))
const collator = new Intl.Collator('he', { numeric: true })

const brandGroup = (page: Page) => page.getByRole('group', { name: 'מותג' })
const socketGroup = (page: Page) => page.getByRole('group', { name: SOCKET_LABEL })
const sortSelect = (page: Page) => page.getByRole('combobox', { name: 'מיון' })
const count = (page: Page) => page.getByRole('status').filter({ hasText: /מוצרים$|מוצר אחד/ })

async function pricesOnPage(page: Page): Promise<number[]> {
  return (await cardNames(page)).map((name) => byName.get(name)!.price.current)
}

test.describe('filters', () => {
  test('filters by brand and writes the choice to the URL', async ({ page }) => {
    await page.goto('category/cpu')
    await expect(page.getByRole('article')).toHaveCount(cpus.length)

    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()

    const intel = cpus.filter((product) => product.brand === 'intel')
    await expect(page.getByRole('article')).toHaveCount(intel.length)
    await expect(count(page)).toHaveText(`${intel.length} מוצרים`)
    await expect(page).toHaveURL(/\/category\/cpu\/?\?brand=intel$/)
  })

  test('offers specification filters derived from the category products, with counts', async ({
    page,
  }) => {
    await page.goto('category/cpu')

    const sockets = [...new Set(cpus.map((product) => specValue(product, SOCKET_LABEL)))]
    for (const socket of sockets) {
      const expected = cpus.filter((product) => specValue(product, SOCKET_LABEL) === socket).length
      await expect(
        socketGroup(page).getByRole('checkbox', { name: new RegExp(`${socket}.*${expected}`) }),
      ).toBeVisible()
    }
  })

  test('combines filters with AND across groups and disables dead ends', async ({ page }) => {
    await page.goto('category/cpu')

    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()
    // AM5 only exists on AMD, so with Intel selected it can no longer be chosen.
    await expect(socketGroup(page).getByRole('checkbox', { name: /AM5/ })).toBeDisabled()

    await socketGroup(page)
      .getByRole('checkbox', { name: /LGA 1851/ })
      .click()

    const expected = cpus.filter(
      (product) => product.brand === 'intel' && specValue(product, SOCKET_LABEL) === 'LGA 1851',
    )
    await expect(page.getByRole('article')).toHaveCount(expected.length)
    expect((await cardNames(page)).sort()).toEqual(expected.map((product) => product.name).sort())
    await expect(page).toHaveURL(/brand=intel&s\..+=LGA\+1851$/)
    await expect(page.getByRole('list', { name: 'מסננים פעילים' }).getByRole('button')).toHaveCount(
      3,
    ) // 2 chips + "clear all"
  })

  test('ORs values inside one group', async ({ page }) => {
    await page.goto('category/cpu')

    await socketGroup(page).getByRole('checkbox', { name: /AM5/ }).click()
    await socketGroup(page)
      .getByRole('checkbox', { name: /LGA 1700/ })
      .click()

    const expected = cpus.filter((product) =>
      ['AM5', 'LGA 1700'].includes(specValue(product, SOCKET_LABEL) ?? ''),
    )
    await expect(page.getByRole('article')).toHaveCount(expected.length)
  })

  test('clearing the filters leaves a clean URL', async ({ page }) => {
    await page.goto('category/cpu?brand=intel')
    await expect(brandGroup(page).getByRole('checkbox', { name: /Intel/ })).toBeChecked()

    await page.getByRole('button', { name: 'ניקוי סינון' }).click()

    await expect(page).toHaveURL(/\/online-store\/category\/cpu\/?$/)
    await expect(page.getByRole('article')).toHaveCount(cpus.length)
    await expect(brandGroup(page).getByRole('checkbox', { name: /Intel/ })).not.toBeChecked()
  })

  test('removing a single chip keeps the other filters', async ({ page }) => {
    await page.goto('category/cpu?brand=intel&brand=amd')

    await page.getByRole('button', { name: 'הסרת מסנן מותג: AMD' }).click()

    await expect(page).toHaveURL(/\/category\/cpu\/?\?brand=intel$/)
  })

  test('filters the whole catalog by brand on the products page', async ({ page }) => {
    await page.goto('products')

    await brandGroup(page).getByRole('checkbox', { name: /AMD/ }).click()

    const amd = catalog.filter((product) => product.brand === 'amd')
    await expect(page.getByRole('article')).toHaveCount(amd.length)
    // Specification filters only make sense inside one category.
    await expect(socketGroup(page)).toHaveCount(0)
  })
})

test.describe('sorting', () => {
  test('sorts by price in both directions', async ({ page }) => {
    await page.goto('category/cpu')

    await sortSelect(page).selectOption({ label: 'מחיר: מהנמוך לגבוה' })
    // The URL and the list change together, so wait for the URL before reading the list.
    await expect(page).toHaveURL(/\?sort=price-asc$/)
    const ascending = await pricesOnPage(page)
    expect(ascending).toEqual([...ascending].sort((a, b) => a - b))

    await sortSelect(page).selectOption({ label: 'מחיר: מהגבוה לנמוך' })
    await expect(page).toHaveURL(/\?sort=price-desc$/)
    const descending = await pricesOnPage(page)
    expect(descending).toEqual([...descending].sort((a, b) => b - a))
    expect(descending).toEqual([...ascending].reverse())
  })

  test('sorts by name in both directions', async ({ page }) => {
    await page.goto('category/cpu')

    await sortSelect(page).selectOption({ label: 'שם: A עד Z' })
    await expect(page).toHaveURL(/\?sort=name-asc$/)
    const expected = cpus.map((product) => product.name).sort(collator.compare)
    expect(await cardNames(page)).toEqual(expected)

    await sortSelect(page).selectOption({ label: 'שם: Z עד A' })
    await expect(page).toHaveURL(/\?sort=name-desc$/)
    expect(await cardNames(page)).toEqual([...expected].reverse())
  })

  test('applies the sort on top of the filters and returns to a clean URL for the default', async ({
    page,
  }) => {
    await page.goto('category/cpu?brand=intel')

    await sortSelect(page).selectOption({ label: 'מחיר: מהנמוך לגבוה' })
    await expect(page).toHaveURL(/\?brand=intel&sort=price-asc$/)
    const prices = await pricesOnPage(page)
    expect(prices).toEqual([...prices].sort((a, b) => a - b))

    await page.getByRole('button', { name: 'ניקוי סינון' }).click()
    await expect(page).toHaveURL(/\?sort=price-asc$/) // the sort is not a filter, so it stays

    await sortSelect(page).selectOption({ label: 'ברירת מחדל' })
    await expect(page).toHaveURL(/\/online-store\/category\/cpu\/?$/)
  })
})

test.describe('URL-driven state', () => {
  test('survives a reload', async ({ page }) => {
    await page.goto('category/cpu')
    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()
    await socketGroup(page)
      .getByRole('checkbox', { name: /LGA 1851/ })
      .click()
    await sortSelect(page).selectOption({ label: 'מחיר: מהגבוה לנמוך' })
    await expect(page).toHaveURL(/sort=price-desc$/)
    const before = await cardNames(page)
    const urlBefore = page.url()

    await page.reload()

    expect(page.url()).toBe(urlBefore)
    expect(await cardNames(page)).toEqual(before)
    await expect(brandGroup(page).getByRole('checkbox', { name: /Intel/ })).toBeChecked()
    await expect(socketGroup(page).getByRole('checkbox', { name: /LGA 1851/ })).toBeChecked()
    await expect(sortSelect(page)).toHaveValue('price-desc')
  })

  test('reproduces the same view from a shared URL in a fresh browser context', async ({
    page,
    browser,
  }) => {
    await page.goto('category/cpu')
    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()
    await sortSelect(page).selectOption({ label: 'מחיר: מהנמוך לגבוה' })
    await expect(page).toHaveURL(/sort=price-asc$/)
    const shared = page.url()
    const names = await cardNames(page)

    const other = await browser.newContext({ locale: 'he-IL' })
    const otherPage = await other.newPage()
    await otherPage.goto(shared)

    await expect(otherPage.getByRole('article').first()).toBeVisible()
    expect(await cardNames(otherPage)).toEqual(names)
    await expect(otherPage.getByRole('combobox', { name: 'מיון' })).toHaveValue('price-asc')
    await other.close()
  })

  test('steps through filter changes with the browser back and forward buttons', async ({
    page,
  }) => {
    await page.goto('category/cpu')
    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()
    await socketGroup(page)
      .getByRole('checkbox', { name: /LGA 1851/ })
      .click()

    await page.goBack()
    await expect(brandGroup(page).getByRole('checkbox', { name: /Intel/ })).toBeChecked()
    await expect(socketGroup(page).getByRole('checkbox', { name: /LGA 1851/ })).not.toBeChecked()

    await page.goBack()
    await expect(page).toHaveURL(/\/online-store\/category\/cpu\/?$/)
    await expect(page.getByRole('article')).toHaveCount(cpus.length)

    await page.goForward()
    await expect(page).toHaveURL(/\?brand=intel$/)
  })

  test('keeps the filters when returning from a product page', async ({ page }) => {
    await page.goto('category/cpu?brand=amd')
    const [first] = await cardNames(page)

    await page.getByRole('link', { name: first!, exact: true }).click()
    await expect(page).toHaveURL(/\/products\//)
    await page.goBack()

    await expect(page).toHaveURL(/\?brand=amd$/)
    await expect(brandGroup(page).getByRole('checkbox', { name: /AMD/ })).toBeChecked()
  })

  test('does not lose a filter when two are clicked in quick succession on a slow device', async ({
    page,
    context,
  }) => {
    await page.goto('category/cpu')
    await expect(page.getByRole('article').first()).toBeVisible()
    // Slow the CPU down like a low-end phone: the first change is still being rendered when the
    // second click arrives. (This used to drop the first filter.)
    const session = await context.newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })

    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()
    await socketGroup(page)
      .getByRole('checkbox', { name: /LGA 1851/ })
      .click()

    await expect(page).toHaveURL(/brand=intel/)
    await expect(page).toHaveURL(/s\..+=LGA\+1851/)
    await expect(brandGroup(page).getByRole('checkbox', { name: /Intel/ })).toBeChecked()
    await expect(socketGroup(page).getByRole('checkbox', { name: /LGA 1851/ })).toBeChecked()
  })

  test('ignores invalid and unknown parameters instead of showing no products', async ({
    page,
  }) => {
    await page.goto('category/cpu?s.fake=value&brand=nope&sort=chaos&junk=1')

    await expect(page.getByRole('article')).toHaveCount(cpus.length)
    await expect(sortSelect(page)).toHaveValue('default')
    await expect(page.getByRole('list', { name: 'מסננים פעילים' })).toHaveCount(0)
  })

  test('ignores an unknown value of a known specification label', async ({ page }) => {
    await page.goto(
      `category/cpu?${new URLSearchParams({ [`s.${SOCKET_LABEL}`]: 'No-Such-Socket' })}`,
    )

    await expect(page.getByRole('article')).toHaveCount(cpus.length)
    await expect(page.getByRole('list', { name: 'מסננים פעילים' })).toHaveCount(0)
  })

  test('keeps only the valid parts of a mixed URL and drops the rest on the next change', async ({
    page,
  }) => {
    const search = new URLSearchParams([
      [`s.${SOCKET_LABEL}`, 'LGA 1851'],
      [`s.${SOCKET_LABEL}`, 'No-Such-Socket'],
      ['s.fake', 'value'],
    ])
    await page.goto(`category/cpu?${search}`)

    const expected = cpus.filter((product) => specValue(product, SOCKET_LABEL) === 'LGA 1851')
    await expect(page.getByRole('article')).toHaveCount(expected.length)

    await brandGroup(page).getByRole('checkbox', { name: /Intel/ }).click()

    const params = new URL(page.url()).searchParams
    expect([...params.keys()].sort()).toEqual(['brand', `s.${SOCKET_LABEL}`])
    expect(params.getAll(`s.${SOCKET_LABEL}`)).toEqual(['LGA 1851'])
  })
})
