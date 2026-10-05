import { BRAND_NAMES, catalog, CATEGORY_LABELS, productById } from './support/catalog'
import { cardNames, header } from './support/helpers'
import { expect, test } from './support/test'

const searchBox = (page: import('@playwright/test').Page) =>
  header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' })

/**
 * Submits a search and waits until the results page for it has rendered. The router applies a
 * navigation a moment after it is requested, so ordinary tests wait for the new page before
 * doing anything else, like a person would. (Typing the next search before that has happened is
 * covered on purpose by the slow-device test below.)
 */
async function searchFor(page: import('@playwright/test').Page, text: string) {
  await searchBox(page).fill(text)
  await searchBox(page).press('Enter')
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe(text.trim())
  await expect(
    page.getByRole('heading', { level: 1, name: `תוצאות חיפוש עבור “${text.trim()}”` }),
  ).toBeVisible()
}

const corsair = catalog.filter((product) => product.brand === 'corsair')
const intel = catalog.filter((product) => product.brand === 'intel')

test.describe('header search', () => {
  test('searches from the header and shows the matching products', async ({ page }) => {
    await page.goto('')

    await searchFor(page, 'corsair')

    await expect(page).toHaveURL(/\/online-store\/search\?q=corsair$/)
    await expect(
      page.getByRole('heading', { level: 1, name: 'תוצאות חיפוש עבור “corsair”' }),
    ).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(corsair.length)
    await expect(page.getByRole('article').getByRole('img', { name: 'Corsair' })).toHaveCount(
      corsair.length,
    )
  })

  test('also works with the search button, and is case-insensitive', async ({ page }) => {
    await page.goto('')

    await searchBox(page).fill('CORSAIR')
    await header(page).getByRole('button', { name: 'חיפוש' }).click()

    await expect(page.getByRole('article')).toHaveCount(corsair.length)
  })

  test('finds products by a Hebrew category name', async ({ page }) => {
    await page.goto('')

    await searchFor(page, CATEGORY_LABELS.case!)

    const cases = catalog.filter((product) => product.category === 'case')
    await expect(page.getByRole('article')).toHaveCount(cases.length)
    expect(cases.length).toBeGreaterThan(0)
  })

  test('finds a product by its SKU', async ({ page }) => {
    await page.goto('')

    await searchFor(page, 'GP-P650G')

    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('article')).toContainText('GP-P650G')
  })

  test('requires every word to match', async ({ page }) => {
    await page.goto('')

    // No ASUS product is an RTX 4070, in its title or anywhere in its specifications.
    await searchFor(page, 'asus 4070')

    await expect(page.getByRole('heading', { name: 'לא נמצאו מוצרים' })).toBeVisible()
  })

  test('searching again replaces the results, and the box shows the current search', async ({
    page,
  }) => {
    await page.goto('')
    await searchFor(page, 'corsair')
    await expect(page.getByRole('article')).toHaveCount(corsair.length)

    await searchFor(page, 'intel')

    await expect(page).toHaveURL(/\/online-store\/search\?q=intel$/)
    await expect(page.getByRole('article')).toHaveCount(intel.length)
    await expect(searchBox(page)).toHaveValue('intel')
  })

  test('shows an empty state when nothing matches, and recovers with a new search', async ({
    page,
  }) => {
    await page.goto('')

    await searchFor(page, 'zzzzzz')

    await expect(page.getByRole('heading', { name: 'לא נמצאו מוצרים' })).toBeVisible()
    await expect(page.getByText('לא נמצאו מוצרים עבור “zzzzzz”.')).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(0)

    await searchFor(page, 'intel')
    await expect(page.getByRole('article')).toHaveCount(intel.length)
  })

  test('the empty-state link leads back to all products', async ({ page }) => {
    await page.goto('search?q=zzzzzz')

    await page.getByRole('link', { name: 'לכל המוצרים' }).click()

    await expect(page).toHaveURL(/\/online-store\/products\/?$/)
    await expect(page.getByRole('article')).toHaveCount(catalog.length)
  })

  test('ignores an empty search and prompts when opened without a search text', async ({
    page,
  }) => {
    await page.goto('products')

    await searchBox(page).fill('   ')
    await searchBox(page).press('Enter')
    await expect(page).toHaveURL(/\/online-store\/products\/?$/)

    await page.goto('search')
    await expect(page.getByText('מה מחפשים?')).toBeVisible()
  })

  test('keeps the results after a reload and steps back through searches', async ({ page }) => {
    await page.goto('')
    await searchFor(page, 'corsair')
    await searchFor(page, 'intel')

    await page.reload()
    await expect(page.getByRole('article')).toHaveCount(intel.length)
    await expect(searchBox(page)).toHaveValue('intel')

    await page.goBack()
    await expect(page).toHaveURL(/q=corsair$/)
    await expect(page.getByRole('article')).toHaveCount(corsair.length)
    await expect(searchBox(page)).toHaveValue('corsair')
  })

  test('typing right after submitting a search is not lost on a slow device', async ({
    page,
    context,
  }) => {
    await page.goto('')
    const session = await context.newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })

    await searchBox(page).fill('corsair')
    await searchBox(page).press('Enter')
    // No waiting: the next search is typed before the first one has been rendered. (The box used
    // to be reset to the previous search, so the second Enter searched for the old text again.)
    await searchBox(page).fill('intel')
    await searchBox(page).press('Enter')

    await expect
      .poll(() => new URL(page.url()).searchParams.get('q'), { timeout: 15_000 })
      .toBe('intel')
    await expect(searchBox(page)).toHaveValue('intel')
  })

  test('shows search text as plain text and never as HTML', async ({ page }) => {
    await page.goto('')

    await searchFor(page, '<img src=x onerror=alert(1)>')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      '<img src=x onerror=alert(1)>',
    )
    await expect(page.locator('main img[src="x"]')).toHaveCount(0)
  })

  test('combines the search with a brand filter', async ({ page }) => {
    await page.goto('')
    await searchFor(page, CATEGORY_LABELS.cpu!)
    const cpus = catalog.filter((product) => product.category === 'cpu')
    await expect(page.getByRole('article')).toHaveCount(cpus.length)

    await page.getByRole('group', { name: 'מותג' }).getByRole('checkbox', { name: /AMD/ }).click()

    const amd = cpus.filter((product) => product.brand === 'amd')
    await expect(page.getByRole('article')).toHaveCount(amd.length)
    await expect(page).toHaveURL(/q=.+&brand=amd$/)
    expect(await cardNames(page)).toEqual(expect.arrayContaining(amd.map((p) => p.name)))
    expect(BRAND_NAMES.amd).toBe('AMD')
  })
})

test.describe('model number search', () => {
  const rtx4070 = productById('N4070GAMINGOCV212GD')

  for (const query of ['4070', 'RTX 4070', 'rtx-4070', 'rtx4070', 'GeForce RTX 4070']) {
    test(`"${query}" finds the RTX 4070`, async ({ page }) => {
      await page.goto('')

      await searchFor(page, query)

      expect(await cardNames(page)).toEqual([rtx4070.name])
    })
  }

  test('finds a model by a part of its number and by its SKU', async ({ page }) => {
    await page.goto('')

    await searchFor(page, '7800')
    expect(await cardNames(page)).toEqual([productById('100-000000910').name])

    await searchFor(page, 'gp p650g')
    expect(await cardNames(page)).toEqual([productById('GP-P650G').name])
  })

  test('finds products by a specification when the title does not say it', async ({ page }) => {
    await page.goto('')

    await searchFor(page, 'ddr5')

    const names = await cardNames(page)
    expect(names.length).toBeGreaterThan(0)
    expect(names).not.toContain(rtx4070.name)
  })

  test('calls the default order "best match" in a search', async ({ page }) => {
    await page.goto('')
    await searchFor(page, 'intel')

    await expect(page.getByRole('option', { name: 'התאמה לחיפוש' })).toHaveCount(1)
  })

  test('explains what to try when nothing is found', async ({ page }) => {
    await page.goto('')

    await searchFor(page, 'sn8100')

    await expect(page.getByRole('heading', { level: 2, name: 'לא נמצאו מוצרים' })).toBeVisible()
    await expect(page.getByText('לא נמצאו מוצרים עבור “sn8100”.')).toBeVisible()
    await expect(page.getByText(/חלק ממספר הדגם/)).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(0)
  })
})
