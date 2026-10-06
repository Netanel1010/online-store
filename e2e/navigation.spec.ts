import type { Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/a11y'
import { PSU } from './support/catalog'
import { cartLink, header, newAccount, register } from './support/helpers'
import { expect, test } from './support/test'

const mainNav = (page: Page) => header(page).getByRole('navigation', { name: 'ניווט ראשי' })
const categoryNav = (page: Page) => header(page).getByRole('navigation', { name: 'קטגוריות' })
const searchBox = (page: Page) => header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' })

test.describe('the current page in the header', () => {
  test('a category page marks its category as the page and "products" as the section', async ({
    page,
  }) => {
    await page.goto('category/gpu')
    await expect(page.getByRole('heading', { level: 1, name: 'כרטיסי מסך' })).toBeVisible()

    await expect(categoryNav(page).getByRole('link', { name: 'כרטיסי מסך' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(mainNav(page).getByRole('link', { name: 'מוצרים' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(categoryNav(page).locator('[aria-current]')).toHaveCount(1)
  })

  test('a product page keeps its category and "products" marked', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)
    await expect(page.getByRole('heading', { level: 1, name: PSU.fullName })).toBeVisible()

    await expect(categoryNav(page).getByRole('link', { name: 'ספקי כוח' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(mainNav(page).getByRole('link', { name: 'מוצרים' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(mainNav(page).getByRole('link', { name: 'בית' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  test('the marks follow the visitor from page to page', async ({ page }) => {
    await page.goto('')
    await expect(mainNav(page).getByRole('link', { name: 'בית' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(categoryNav(page).locator('[aria-current]')).toHaveCount(0)

    await categoryNav(page).getByRole('link', { name: 'מעבדים' }).click()
    await expect(categoryNav(page).getByRole('link', { name: 'מעבדים' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(mainNav(page).getByRole('link', { name: 'בית' })).not.toHaveAttribute(
      'aria-current',
    )

    await page.getByRole('article').first().getByRole('link').first().click()
    await expect(categoryNav(page).getByRole('link', { name: 'מעבדים' })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  test('the cart, favorites and sign-in links show when their page is open', async ({ page }) => {
    await page.goto('cart')
    await expect(page.getByRole('heading', { level: 1, name: 'עגלת קניות' })).toBeVisible()
    await expect(cartLink(page)).toHaveAttribute('aria-current', 'page')
    await expect(header(page).getByRole('link', { name: 'מועדפים' })).not.toHaveAttribute(
      'aria-current',
    )

    await header(page).getByRole('link', { name: 'מועדפים' }).click()
    await expect(header(page).getByRole('link', { name: 'מועדפים' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(cartLink(page)).not.toHaveAttribute('aria-current')

    await header(page).getByRole('link', { name: 'התחברות' }).click()
    await expect(header(page).getByRole('link', { name: 'התחברות' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('the marked link has more than a colour: a tinted background and bold text', async ({
    page,
  }) => {
    await page.goto('category/gpu')
    const current = categoryNav(page).getByRole('link', { name: 'כרטיסי מסך' })
    const other = categoryNav(page).getByRole('link', { name: 'מעבדים' })

    await expect(current).toHaveCSS('font-weight', '600')
    expect(await current.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
      await other.evaluate((el) => getComputedStyle(el).backgroundColor),
    )
  })
})

test.describe('the category bar on a narrow screen', () => {
  test.use({ viewport: { width: 820, height: 1000 } })

  test('scrolls the current category into view and has no accessibility violations', async ({
    page,
  }) => {
    // The last category is cut off at this width until the bar scrolls to it.
    await page.goto('category/headset')
    await expect(page.getByRole('heading', { level: 1, name: 'אוזניות' })).toBeVisible()

    const current = categoryNav(page).getByRole('link', { name: 'אוזניות' })
    await expect
      .poll(async () => {
        const box = await current.boundingBox()
        return box !== null && box.x >= 0 && box.x + box.width <= 820
      })
      .toBe(true)
    await expectNoAxeViolations(page)
  })
})

test.describe('the search box', () => {
  test('has a clear button while there is text, and keeps the focus in the box', async ({
    page,
  }) => {
    await page.goto('')
    const clear = header(page).getByRole('button', { name: 'מחיקת הטקסט' })
    await expect(clear).toHaveCount(0)

    await searchBox(page).fill('intel')
    await expect(clear).toBeVisible()
    await clear.click()

    await expect(searchBox(page)).toHaveValue('')
    await expect(searchBox(page)).toBeFocused()
    await expect(clear).toHaveCount(0)
    await expect(page).toHaveURL(/\/online-store\/$/)
  })

  test('shows the text of the current search, which can be cleared', async ({ page }) => {
    await page.goto('search?q=corsair')
    await expect(searchBox(page)).toHaveValue('corsair')

    await header(page).getByRole('button', { name: 'מחיקת הטקסט' }).click()

    await expect(searchBox(page)).toHaveValue('')
    await expect(page.getByRole('heading', { level: 1, name: /corsair/ })).toBeVisible()
  })
})

test.describe('the header on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  const menu = (page: Page) => page.getByRole('dialog', { name: 'תפריט ראשי' })

  test('has a search button that opens the menu with the search box ready', async ({ page }) => {
    await page.goto('')

    await page.getByRole('button', { name: 'פתיחת חיפוש' }).click()

    await expect(menu(page)).toBeVisible()
    const box = menu(page).getByRole('searchbox', { name: 'חיפוש מוצרים' })
    await expect(box).toBeFocused()
    await page.keyboard.type('intel')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/search\?q=intel$/)
    await expect(menu(page)).toBeHidden()
  })

  test('the menu button still opens the menu without typing into the search box', async ({
    page,
  }) => {
    await page.goto('')

    await page.getByRole('button', { name: 'פתיחת תפריט' }).click()

    await expect(menu(page)).toBeVisible()
    await expect(menu(page).getByRole('searchbox')).not.toBeFocused()
  })

  test('shows the current category in the opened menu', async ({ page }) => {
    await page.goto('category/headset')
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click()

    const current = menu(page).getByRole('link', { name: 'אוזניות' })
    await expect(current).toHaveAttribute('aria-current', 'page')
    await expect(current).toBeInViewport()
  })

  test('keeps sign-out in the menu: no lone sign-out icon next to the cart', async ({ page }) => {
    await register(page, newAccount())
    await expect(page).toHaveURL(/\/online-store\/$/)

    await expect(header(page).getByRole('button', { name: 'התנתקות', exact: true })).toBeHidden()
    await page.getByRole('button', { name: 'פתיחת תפריט' }).click()
    await expect(menu(page).getByRole('button', { name: 'התנתקות', exact: true })).toBeVisible()
    await expect(menu(page).getByText('שלום,')).toBeVisible()
  })
})
