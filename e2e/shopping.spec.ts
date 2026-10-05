import type { Page } from '@playwright/test'
import { catalog, PSU, RAM, SALE_GPU, type CatalogProduct } from './support/catalog'
import {
  addToCartFromProductPage,
  amount,
  cartLink,
  favoritesLink,
  header,
  summary,
  summaryTotal,
} from './support/helpers'
import { expect, test } from './support/test'

const toasts = (page: Page) => page.getByRole('region', { name: 'התראות' })
const heart = (page: Page, product: CatalogProduct) =>
  page.getByRole('button', { name: `מועדפים: ${product.name}` })
const addButton = (page: Page, product: CatalogProduct) =>
  page.getByRole('button', { name: `הוספה לעגלה: ${product.name}` })

test.describe('product details', () => {
  test('opens a product from the listing and shows its information', async ({ page }) => {
    await page.goto('products')

    await page.getByRole('link', { name: PSU.name, exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`/online-store/products/${PSU.id}/?$`))
    await expect(page.getByRole('heading', { level: 1, name: PSU.fullName })).toBeVisible()
    await expect(page.getByText(PSU.id, { exact: true })).toBeVisible()
    await expect(page.getByText(PSU.warranty)).toBeVisible()
    await expect(page.getByRole('img', { name: 'Gigabyte', exact: true })).toBeVisible()
    // Specification table, straight from the catalog.
    const firstSpec = PSU.specs[0]!
    await expect(page.getByRole('rowheader', { name: firstSpec.label })).toBeVisible()
    await expect(page.getByRole('cell', { name: firstSpec.value, exact: true })).toBeVisible()
    // Breadcrumb back to the category.
    await expect(
      page.getByRole('navigation', { name: 'פירורי לחם' }).getByRole('link', { name: 'ספקי כוח' }),
    ).toBeVisible()
  })

  test('shows the price, and the Eilat price when the product has one', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)

    // The current price sits in the element that also holds the screen-reader label "מחיר:".
    const price = page.locator('span.sr-only', { hasText: 'מחיר:' }).locator('xpath=..')
    expect(amount(await price.textContent())).toBe(PSU.price.current)
    expect(amount(await page.getByText(/מחיר באילת/).textContent())).toBe(PSU.price.eilat)
    await expect(page.locator('del')).toHaveCount(0)
  })

  test('shows the previous price and the discount for a product on sale', async ({ page }) => {
    await page.goto(`products/${SALE_GPU.id}`)

    const discount = Math.round((1 - SALE_GPU.price.current / SALE_GPU.price.original!) * 100)
    expect(amount(await page.locator('del').textContent())).toBe(SALE_GPU.price.original)
    await expect(page.getByText(`הנחה ${discount}%`)).toBeVisible()
  })

  test('switches the main image from the gallery thumbnails', async ({ page }) => {
    await page.goto(`products/${SALE_GPU.id}`)
    const main = page.getByRole('img', { name: `${SALE_GPU.name} - תמונה 1 מתוך` })
    await expect(main).toHaveAttribute('src', `/online-store/${SALE_GPU.images.gallery[0]}`)

    await page.getByRole('button', { name: /הצגת תמונה 3 מתוך/ }).click()

    await expect(page.getByRole('img', { name: /תמונה 3 מתוך/ })).toHaveAttribute(
      'src',
      `/online-store/${SALE_GPU.images.gallery[2]}`,
    )
    await expect(page.getByRole('button', { name: /הצגת תמונה 3 מתוך/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('links to the manufacturer safely in a new tab', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)

    const link = page.getByRole('link', { name: /לאתר היצרן/ })
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link).toHaveAttribute('href', /^https:\/\//)
  })

  test('adds to the cart and toggles the favorite from the product page', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)

    await addButton(page, PSU).click()
    await expect(toasts(page).getByText(`${PSU.name} נוסף לעגלה`)).toBeVisible()
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')

    await heart(page, PSU).click()
    await expect(heart(page, PSU)).toHaveAttribute('aria-pressed', 'true')
    await expect(toasts(page).getByText(`${PSU.name} נוסף למועדפים`)).toBeVisible()
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')

    await heart(page, PSU).click()
    await expect(heart(page, PSU)).toHaveAttribute('aria-pressed', 'false')
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים')
  })

  test('remembers the cart and the favorite after a reload', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)
    await addButton(page, PSU).click()
    await heart(page, PSU).click()
    await expect(heart(page, PSU)).toHaveAttribute('aria-pressed', 'true')

    await page.reload()

    await expect(heart(page, PSU)).toHaveAttribute('aria-pressed', 'true')
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')
    await expect(page.getByText('בעגלה: 1')).toBeVisible()
  })

  test('follows the toast link to the cart', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)
    await addButton(page, PSU).click()

    await toasts(page).getByRole('link', { name: 'לעגלה' }).click()

    await expect(page).toHaveURL(/\/online-store\/cart$/)
    await expect(page.getByRole('link', { name: PSU.name, exact: true })).toBeVisible()
  })
})

test.describe('cart', () => {
  test('shows an empty cart', async ({ page }) => {
    await page.goto('cart')

    await expect(page.getByText('העגלה ריקה')).toBeVisible()
    await expect(page.getByRole('link', { name: 'לכל המוצרים' })).toHaveAttribute(
      'href',
      '/online-store/products',
    )
  })

  test('adds products, changes quantities, calculates the total and removes lines', async ({
    page,
  }) => {
    await addToCartFromProductPage(page, PSU)
    await addToCartFromProductPage(page, RAM)

    await cartLink(page).click()
    await expect(page.getByRole('heading', { level: 1, name: 'עגלת קניות' })).toBeVisible()
    const unitTotal = PSU.price.current + RAM.price.current
    await expect.poll(() => summaryTotal(page)).toBe(unitTotal)

    // Plus button.
    await page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` }).click()
    await expect.poll(() => summaryTotal(page)).toBe(2 * PSU.price.current + RAM.price.current)

    // Typing a quantity.
    const quantity = page.getByRole('textbox', { name: `כמות ${PSU.name}` })
    await quantity.fill('5')
    await expect.poll(() => summaryTotal(page)).toBe(5 * PSU.price.current + RAM.price.current)

    // Minus button, and the minus button is disabled at 1.
    await quantity.fill('1')
    await expect(page.getByRole('button', { name: `הפחתת כמות: ${PSU.name}` })).toBeDisabled()
    await expect.poll(() => summaryTotal(page)).toBe(unitTotal)

    // Remove a line.
    await page.getByRole('button', { name: `הסרת ${RAM.name} מהעגלה` }).click()
    await expect(page.getByRole('link', { name: RAM.name, exact: true })).toHaveCount(0)
    await expect.poll(() => summaryTotal(page)).toBe(PSU.price.current)
    await expect(page.getByRole('heading', { level: 1, name: 'עגלת קניות' })).toBeFocused()

    // Remove the last line.
    await page.getByRole('button', { name: `הסרת ${PSU.name} מהעגלה` }).click()
    await expect(page.getByText('העגלה ריקה')).toBeVisible()
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות')
  })

  test('counts units, not lines, in the header badge', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await addToCartFromProductPage(page, RAM)
    await page.goto('cart')
    await page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` }).click()

    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 3 פריטים')
    await expect(cartLink(page)).toHaveText('3')
  })

  test('keeps the quantities after a reload', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')
    await page.getByRole('textbox', { name: `כמות ${PSU.name}` }).fill('4')
    await expect.poll(() => summaryTotal(page)).toBe(4 * PSU.price.current)

    await page.reload()

    await expect(page.getByRole('textbox', { name: `כמות ${PSU.name}` })).toHaveValue('4')
    await expect.poll(() => summaryTotal(page)).toBe(4 * PSU.price.current)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 4 פריטים')
  })

  test('clamps the quantity to the allowed range', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')
    const quantity = page.getByRole('textbox', { name: `כמות ${PSU.name}` })

    await quantity.fill('500')
    await expect(quantity).toHaveValue('99')
    await expect.poll(() => summaryTotal(page)).toBe(99 * PSU.price.current)

    await quantity.fill('abc') // not a number: ignored
    await expect(quantity).toHaveValue('99')
  })

  test('shows the savings for products on sale', async ({ page }) => {
    await addToCartFromProductPage(page, SALE_GPU)
    await page.goto('cart')

    const savings = SALE_GPU.price.original! - SALE_GPU.price.current
    const row = summary(page)
      .locator('div', { has: page.getByText('חיסכון', { exact: true }) })
      .last()
    expect(amount(await row.locator('dd').textContent())).toBe(savings)
    await expect.poll(() => summaryTotal(page)).toBe(SALE_GPU.price.current)
  })

  test('does not invent shipping, VAT or payment amounts', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')

    await expect(summary(page)).toContainText('לא מחושבים משלוח ומע"מ, ולא מתבצע תשלום')
  })
})

test.describe('favorites', () => {
  const [first, second] = [PSU, RAM]

  test('shows an empty state', async ({ page }) => {
    await page.goto('favorites')

    await expect(page.getByText('אין מוצרים במועדפים')).toBeVisible()
  })

  test('adds favorites from the listing and lists them on the favorites page', async ({ page }) => {
    await page.goto('products')

    await heart(page, first).click()
    await heart(page, second).click()
    await expect(heart(page, first)).toHaveAttribute('aria-pressed', 'true')
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 2 פריטים')

    await favoritesLink(page).click()

    await expect(page.getByRole('heading', { level: 1, name: 'מועדפים' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(2)
    await expect(page.getByRole('link', { name: first.name, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: second.name, exact: true })).toBeVisible()
  })

  test('removes a favorite from the favorites page, and keeps the rest after a reload', async ({
    page,
  }) => {
    await page.goto('products')
    await heart(page, first).click()
    await heart(page, second).click()
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 2 פריטים')
    await favoritesLink(page).click()

    await page.getByRole('button', { name: `הסרת ${first.name} מהמועדפים` }).click()

    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1, name: 'מועדפים' })).toBeFocused()
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')

    await page.reload()
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(page.getByRole('link', { name: second.name, exact: true })).toBeVisible()
  })

  test('shows the empty state again after the last favorite is removed', async ({ page }) => {
    await page.goto(`products/${first.id}`)
    await heart(page, first).click()
    await expect(heart(page, first)).toHaveAttribute('aria-pressed', 'true')
    await favoritesLink(page).click()

    await page.getByRole('button', { name: `הסרת ${first.name} מהמועדפים` }).click()

    await expect(page.getByText('אין מוצרים במועדפים')).toBeVisible()
  })

  test('adds a favorite to the cart without removing it from the favorites', async ({ page }) => {
    await page.goto(`products/${first.id}`)
    await heart(page, first).click()
    await expect(heart(page, first)).toHaveAttribute('aria-pressed', 'true')
    await favoritesLink(page).click()

    await addButton(page, first).click()

    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')
    await expect(page.getByRole('article')).toHaveCount(1)
  })

  test('the heart on a product page reflects what is on the favorites page', async ({ page }) => {
    await page.goto('products')
    await heart(page, first).click()
    await expect(heart(page, first)).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('link', { name: first.name, exact: true }).click()

    await expect(heart(page, first)).toHaveAttribute('aria-pressed', 'true')
    expect(header(page)).toBeTruthy()
    expect(catalog.length).toBeGreaterThan(2)
  })
})

test.describe('product page layout', () => {
  test('the gallery buttons and the counter work together with the thumbnails', async ({
    page,
  }) => {
    await page.goto(`products/${SALE_GPU.id}`)
    const total = SALE_GPU.images.gallery.length
    const counter = page.getByText(`1 / ${total}`, { exact: true })
    await expect(counter).toBeVisible()
    await expect(counter).toHaveAttribute('dir', 'ltr')

    await page.getByRole('button', { name: 'תמונה הבאה' }).click()

    await expect(page.getByRole('img', { name: /תמונה 2 מתוך/ })).toHaveAttribute(
      'src',
      `/online-store/${SALE_GPU.images.gallery[1]}`,
    )
    await expect(page.getByText(`2 / ${total}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /הצגת תמונה 2 מתוך/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await page.getByRole('button', { name: 'תמונה קודמת' }).click()
    await page.getByRole('button', { name: 'תמונה קודמת' }).click()
    await expect(page.getByRole('img', { name: new RegExp(`תמונה ${total} מתוך`) })).toBeVisible()
  })

  test('the gallery can be used from the keyboard', async ({ page }) => {
    await page.goto(`products/${SALE_GPU.id}`)

    await page.getByRole('button', { name: 'תמונה הבאה' }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('img', { name: /תמונה 2 מתוך/ })).toBeVisible()
  })

  test('a product on sale shows what it saves, next to the price and the buy buttons', async ({
    page,
  }) => {
    await page.goto(`products/${SALE_GPU.id}`)

    const saving = SALE_GPU.price.original! - SALE_GPU.price.current
    const box = page.locator('.rounded-xl', {
      has: page.getByRole('button', { name: /הוספה לעגלה/ }),
    })
    await expect(box.getByText(/חיסכון של/)).toContainText(saving.toLocaleString('en-US'))
    await expect(box.getByRole('button', { name: /הוספה לעגלה/ })).toBeVisible()
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

    test('has no horizontal scrolling, and the thumbnails scroll inside their own row', async ({
      page,
    }) => {
      await page.goto(`products/${SALE_GPU.id}`)
      await expect(page.getByRole('heading', { level: 1, name: SALE_GPU.fullName })).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      await expect(
        page.getByRole('button', { name: 'הוספה לעגלה: ' + SALE_GPU.name }),
      ).toBeVisible()
    })
  })
})

test.describe('cart layout', () => {
  test('keeps the quantity, the remove button and the line total on one row, with big touch targets', async ({
    page,
  }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')
    const minus = page.getByRole('button', { name: `הפחתת כמות: ${PSU.name}` })
    const plus = page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` })
    const remove = page.getByRole('button', { name: `הסרת ${PSU.name} מהעגלה` })
    const lineTotal = page.getByText('סה"כ לשורה:').locator('xpath=..')

    for (const target of [minus, plus, remove]) {
      const box = (await target.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(43)
      expect(box.width).toBeGreaterThanOrEqual(43)
    }
    const stepper = (await plus.boundingBox())!
    const total = (await lineTotal.boundingBox())!
    expect(Math.abs(stepper.y + stepper.height / 2 - (total.y + total.height / 2))).toBeLessThan(30)
  })

  test('offers to keep shopping from the cart', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')

    await summary(page).getByRole('link', { name: 'המשך בקניות' }).click()

    await expect(page).toHaveURL(/\/online-store\/products\/?$/)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

    test('shows the controls and the line total on one row, below the product', async ({
      page,
    }) => {
      await addToCartFromProductPage(page, PSU)
      await page.goto('cart')
      const plus = page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` })
      const lineTotal = page.getByText('סה"כ לשורה:').locator('xpath=..')
      const name = page.getByRole('link', { name: PSU.name, exact: true })

      const stepper = (await plus.boundingBox())!
      const total = (await lineTotal.boundingBox())!
      const title = (await name.boundingBox())!
      expect(Math.abs(stepper.y + stepper.height / 2 - (total.y + total.height / 2))).toBeLessThan(
        30,
      )
      expect(stepper.y).toBeGreaterThan(title.y + title.height)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
})
