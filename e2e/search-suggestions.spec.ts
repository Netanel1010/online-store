import type { Locator, Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/a11y'
import { catalog, productById } from './support/catalog'
import { header } from './support/helpers'
import { expect, test } from './support/test'

const searchBox = (page: Page) => header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' })
const suggestions = (page: Page) => header(page).getByRole('listbox', { name: 'הצעות לחיפוש' })

const rtx4070 = productById('N4070GAMINGOCV212GD')

test.describe('live suggestions in the header search', () => {
  test('lists matching products while typing, without pressing Enter', async ({ page }) => {
    await page.goto('')

    await searchBox(page).pressSequentially('4070')

    await expect(suggestions(page).getByRole('option').first()).toContainText(rtx4070.name)
    await expect(page).toHaveURL(/\/online-store\/$/)
  })

  test('shows at most five products and a row for all the results', async ({ page }) => {
    await page.goto('')

    await searchBox(page).pressSequentially('intel')

    const options = suggestions(page).getByRole('option')
    await expect(options).toHaveCount(6)
    await expect(options.last()).toContainText('הצגת כל התוצאות עבור “intel”')
    expect(catalog.filter((product) => product.brand === 'intel').length).toBeGreaterThan(5)
  })

  test('follows the text, and offers nothing for one character or for no match', async ({
    page,
  }) => {
    await page.goto('')

    await searchBox(page).pressSequentially('c')
    await expect(suggestions(page)).toHaveCount(0)

    await searchBox(page).pressSequentially('orsair')
    await expect(suggestions(page).getByRole('option').first()).toContainText('Corsair')

    await searchBox(page).fill('zzzzzz')
    await expect(suggestions(page)).toHaveCount(0)
  })

  test('opens the product that is clicked', async ({ page }) => {
    await page.goto('')
    await searchBox(page).pressSequentially('4070')

    await suggestions(page).getByRole('option').first().click()

    await expect(page).toHaveURL(/\/online-store\/products\/N4070GAMINGOCV212GD\/?$/)
    await expect(page.getByRole('heading', { level: 1, name: rtx4070.fullName })).toBeVisible()
  })

  test('works from the keyboard: arrows, Enter, Escape', async ({ page }) => {
    await page.goto('')
    await searchBox(page).pressSequentially('4070')
    // The list comes from the API a moment after the typing pauses: the keys wait for it, as a person does.
    await expect(suggestions(page).getByRole('option').first()).toBeVisible()

    await page.keyboard.press('ArrowDown')
    const first = suggestions(page).getByRole('option').first()
    await expect(first).toHaveAttribute('aria-selected', 'true')
    await expect(searchBox(page)).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(suggestions(page)).toHaveCount(0)
    await expect(searchBox(page)).toHaveValue('4070')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/products\/N4070GAMINGOCV212GD\/?$/)
  })

  test('Enter without a highlighted suggestion still opens the results page', async ({ page }) => {
    await page.goto('')

    await searchBox(page).pressSequentially('corsair')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/online-store\/search\?q=corsair$/)
    await expect(suggestions(page)).toHaveCount(0)
  })

  test('the open list has no accessibility violations', async ({ page }) => {
    await page.goto('')
    await expect(
      page.getByRole('region', { name: 'מבצעים' }).getByRole('article').first(),
    ).toBeVisible()

    await searchBox(page).pressSequentially('corsair')
    await page.keyboard.press('ArrowDown')
    await expect(suggestions(page).getByRole('option').first()).toBeVisible()

    await expectNoAxeViolations(page)
  })
})

test.describe('the search box as one control', () => {
  test('draws one focus outline around the box and the search button', async ({ page }) => {
    await page.goto('')
    const input = searchBox(page)
    const control = input.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    const button = header(page).getByRole('button', { name: 'חיפוש', exact: true })

    await expect(control).toHaveCSS('outline-style', 'none')
    await input.focus()

    await expect(control).toHaveCSS('outline-style', 'solid')
    await expect(control).toHaveCSS('outline-width', '2px')
    await expect(input).toHaveCSS('outline-style', 'none')
    // The outline surrounds the button too: the button lies inside the outlined box.
    const outer = (await control.boundingBox())!
    const inner = (await button.boundingBox())!
    expect(inner.x).toBeGreaterThanOrEqual(outer.x - 0.5)
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 0.5)
  })

  test('the search button still shows its own visible focus when reached with the keyboard', async ({
    page,
  }) => {
    await page.goto('')
    await searchBox(page).focus()

    await page.keyboard.press('Tab')

    const button = header(page).getByRole('button', { name: 'חיפוש', exact: true })
    await expect(button).toBeFocused()
    await expect(button).toHaveCSS('outline-style', 'solid')
  })

  test('is the same one control on a phone, in the menu', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('')
    await page.getByRole('button', { name: 'פתיחת חיפוש' }).click()

    const box = page.getByRole('dialog').getByRole('searchbox')
    await expect(box).toBeFocused()
    await box.pressSequentially('corsair')
    await expect(page.getByRole('dialog').getByRole('option').first()).toBeVisible()
    const control = box.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
    await expect(control).toHaveCSS('outline-style', 'solid')
  })
})

test.describe('the focus after choosing a suggestion', () => {
  test('goes to the start of the product page when a suggestion is chosen with the keyboard', async ({
    page,
  }) => {
    await page.goto('')
    await searchBox(page).pressSequentially('4070')
    await expect(suggestions(page).getByRole('option').first()).toBeVisible()

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { level: 1, name: rtx4070.fullName })).toBeVisible()
    await expect(page.locator('main')).toBeFocused()
  })

  test('goes to the start of the product page when a suggestion is clicked', async ({ page }) => {
    await page.goto('')
    await searchBox(page).pressSequentially('4070')

    await suggestions(page).getByRole('option').first().click()

    await expect(page.getByRole('heading', { level: 1, name: rtx4070.fullName })).toBeVisible()
    await expect(page.locator('main')).toBeFocused()
  })

  test('goes to the start of the results when a search is typed and submitted', async ({
    page,
  }) => {
    await page.goto('')
    await searchBox(page).pressSequentially('intel')

    await page.keyboard.press('Enter')

    await expect(
      page.getByRole('heading', { level: 1, name: 'תוצאות חיפוש עבור “intel”' }),
    ).toBeVisible()
    await expect(page.locator('main')).toBeFocused()
  })
})

// The picture of each suggestion is 48px in the header from 768px and 40px in the menu of a phone.
const pictureSizes = (list: Locator) =>
  list
    .getByRole('option')
    .locator('img')
    .evaluateAll((images) =>
      images.map((image) => {
        const box = image.getBoundingClientRect()
        return `${Math.round(box.width)}x${Math.round(box.height)}`
      }),
    )

test.describe('the size of the pictures in the suggestions', () => {
  for (const width of [768, 1440]) {
    test(`are 48px in the header search at ${width}px, in a list as wide as the field`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('')
      await searchBox(page).pressSequentially('4070')
      await expect(suggestions(page).getByRole('option').first()).toBeVisible()

      const sizes = await pictureSizes(suggestions(page))
      expect(sizes.length).toBeGreaterThan(0)
      expect(new Set(sizes)).toEqual(new Set(['48x48']))
      const list = (await suggestions(page).boundingBox())!
      const form = (await header(page).getByRole('search').boundingBox())!
      expect(Math.abs(list.width - form.width)).toBeLessThanOrEqual(1)
    })
  }

  for (const width of [375, 767]) {
    test(`stay 40px in the menu of a phone at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 })
      await page.goto('')
      // The search of the header is not shown here: the box is the one in the menu.
      await expect(page.locator('header > div > form[role="search"]')).toBeHidden()
      await page.getByRole('button', { name: 'פתיחת חיפוש' }).click()
      const menu = page.getByRole('dialog')
      await menu.getByRole('searchbox').pressSequentially('4070')
      const list = menu.getByRole('listbox', { name: 'הצעות לחיפוש' })
      await expect(list.getByRole('option').first()).toBeVisible()

      const sizes = await pictureSizes(list)
      expect(sizes.length).toBeGreaterThan(0)
      expect(new Set(sizes)).toEqual(new Set(['40x40']))
    })
  }

  // The one way a menu can be seen at 768px or more: it was opened on a phone and the window then
  // widened. Its pictures follow the breakpoint, and the menu still holds them.
  test('a menu left open while the window widens still contains its list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('')
    await page.getByRole('button', { name: 'פתיחת חיפוש' }).click()
    const menu = page.getByRole('dialog')
    await menu.getByRole('searchbox').pressSequentially('4070')
    await expect(menu.getByRole('option').first()).toBeVisible()

    await page.setViewportSize({ width: 1024, height: 812 })

    const frame = (await menu.boundingBox())!
    for (const option of await menu.getByRole('option').all()) {
      const box = (await option.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(frame.x - 0.5)
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      'the page scrolls sideways',
    ).toBe(false)
  })
})
