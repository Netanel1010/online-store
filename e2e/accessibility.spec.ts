import type { Locator, Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/a11y'
import { catalog, PSU, SALE_GPU } from './support/catalog'
import {
  addToCartFromProductPage,
  cartLink,
  fillDeliveryForm,
  fillRegistration,
  header,
  newAccount,
  register,
} from './support/helpers'
import { expect, test } from './support/test'

const toasts = (page: Page) => page.getByRole('region', { name: 'התראות' })

async function signedInWithCart(page: Page) {
  await register(page, newAccount())
  await expect(header(page).getByRole('button', { name: 'התנתקות', exact: true })).toBeVisible()
  await addToCartFromProductPage(page, PSU)
}

/* ------------------------------------------------------------------------------------------ */

test.describe('document: language, direction, title and headings', () => {
  const pages = [
    { path: '', ready: 'חנות רכיבי מחשב' },
    { path: 'products', ready: 'כל המוצרים' },
    { path: 'category/cpu', ready: 'מעבדים' },
    { path: `products/${PSU.id}`, ready: PSU.fullName },
    { path: 'search?q=intel', ready: /תוצאות חיפוש/ },
    { path: 'cart', ready: 'עגלת קניות' },
    { path: 'favorites', ready: 'מועדפים' },
    { path: 'login', ready: 'התחברות' },
    { path: 'register', ready: 'הרשמה' },
    { path: 'no/such/page', ready: 'הדף לא נמצא' },
  ]

  for (const { path, ready } of pages) {
    test(`/${path}: Hebrew, right-to-left, one h1 and a descriptive title`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: ready })).toBeVisible()

      await expect(page.locator('html')).toHaveAttribute('lang', 'he')
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page).toHaveTitle(/\S+ \| N\.M\.S|N\.M\.S \|/)
    })
  }

  test('every page has its own title', async ({ page }) => {
    const titles = new Set<string>()
    for (const path of ['', 'products', 'category/cpu', 'cart', 'favorites', 'login', 'register']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      titles.add(await page.title())
    }
    expect(titles.size).toBe(7)
  })

  test('the layout is mirrored: content starts on the right', async ({ page }) => {
    await page.goto('')

    const logo = await header(page).getByRole('link', { name: 'N.M.S - לדף הבית' }).boundingBox()
    const cart = await cartLink(page).boundingBox()
    // In RTL the logo (start of the line) is to the right of the cart (end of the line).
    expect(logo!.x).toBeGreaterThan(cart!.x)
  })
})

/* ------------------------------------------------------------------------------------------ */

test.describe('automated WCAG A/AA scan (axe-core)', () => {
  test('home page', async ({ page }) => {
    await page.goto('')
    await expect(
      page.getByRole('region', { name: 'מבצעים' }).getByRole('article').first(),
    ).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('product listing', async ({ page }) => {
    await page.goto('products')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('category page with filters applied', async ({ page }) => {
    await page.goto('category/cpu?brand=intel&sort=price-asc')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expect(page.getByRole('list', { name: 'מסננים פעילים' })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('product page for a product on sale', async ({ page }) => {
    await page.goto(`products/${SALE_GPU.id}`)
    await expect(page.getByRole('heading', { level: 1, name: SALE_GPU.fullName })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('search results and the empty search', async ({ page }) => {
    await page.goto('search?q=corsair')
    await expect(page.getByRole('article').first()).toBeVisible()
    await expectNoAxeViolations(page)

    await page.goto('search?q=zzzzzz')
    await expect(page.getByRole('heading', { name: 'לא נמצאו מוצרים' })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('cart (empty and with a product) and favorites', async ({ page }) => {
    await page.goto('cart')
    await expect(page.getByText('העגלה ריקה')).toBeVisible()
    await expectNoAxeViolations(page)

    await addToCartFromProductPage(page, PSU)
    await page.getByRole('button', { name: `מועדפים: ${PSU.name}` }).click()
    await page.goto('cart')
    await expect(page.getByRole('button', { name: `הסרת ${PSU.name} מהעגלה` })).toBeVisible()
    await expectNoAxeViolations(page)

    await page.goto('favorites')
    await expect(page.getByRole('article')).toHaveCount(1)
    await expectNoAxeViolations(page)
  })

  test('login and registration, with and without validation errors', async ({ page }) => {
    await page.goto('login')
    // The page loads on demand: scan it once it has appeared.
    await expect(page.getByRole('heading', { level: 1, name: 'התחברות' })).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByRole('button', { name: 'התחברות' }).click()
    await expect(page.getByText('יש להזין סיסמה')).toBeVisible()
    await expectNoAxeViolations(page)

    await page.goto('register')
    await expect(page.getByRole('heading', { level: 1, name: 'הרשמה' })).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()
    await expect(page.getByText('יש לאשר את הסיסמה')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('checkout (with errors) and the confirmation', async ({ page }) => {
    await signedInWithCart(page)
    await page.goto('checkout')
    await expect(page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()
    await expectNoAxeViolations(page)

    await page.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }).click()
    await expect(page.getByText('יש להזין עיר')).toBeVisible()
    await expectNoAxeViolations(page)

    await fillDeliveryForm(page)
    await page.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('not-found page and a visible toast', async ({ page }) => {
    await page.goto('no/such/page')
    await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible()
    await expectNoAxeViolations(page)

    await page.goto(`products/${PSU.id}`)
    await page.getByRole('button', { name: `הוספה לעגלה: ${PSU.name}` }).click()
    await expect(toasts(page).getByText(`${PSU.name} נוסף לעגלה`)).toBeVisible()
    await expectNoAxeViolations(page)
  })
})

/* ------------------------------------------------------------------------------------------ */

test.describe('names of controls', () => {
  test('icon-only header controls have accessible names', async ({ page }) => {
    await page.goto('')

    await expect(header(page).getByRole('link', { name: 'N.M.S - לדף הבית' })).toBeVisible()
    await expect(header(page).getByRole('link', { name: 'מועדפים' })).toBeVisible()
    await expect(header(page).getByRole('link', { name: 'עגלת קניות' })).toBeVisible()
    await expect(header(page).getByRole('link', { name: 'התחברות' })).toBeVisible()
    await expect(header(page).getByRole('button', { name: 'חיפוש' })).toBeVisible()
    await expect(header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' })).toBeVisible()
  })

  test('every visible control on key pages has a non-empty accessible name', async ({ page }) => {
    for (const path of ['', 'products', 'category/cpu', `products/${PSU.id}`, 'cart', 'login']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const controls = page.locator('a[href], button, input:not([type=hidden]), select, textarea')
      const total = await controls.count()
      for (let index = 0; index < total; index += 1) {
        const control = controls.nth(index)
        if (!(await control.isVisible())) continue
        await expect(control, `control #${index} on /${path}`).toHaveAccessibleName(/\S/)
      }
    }
  })

  test('product images have text alternatives (decorative ones are empty on purpose)', async ({
    page,
  }) => {
    await page.goto(`products/${SALE_GPU.id}`)

    const images = page.locator('main img')
    const total = await images.count()
    for (let index = 0; index < total; index += 1) {
      const alt = await images.nth(index).getAttribute('alt')
      expect(alt, `image #${index} has an alt attribute`).not.toBeNull()
    }
    await expect(page.getByRole('img', { name: new RegExp('תמונה 1 מתוך') })).toBeVisible()
  })

  test('toggle buttons expose their state', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)

    const heart = page.getByRole('button', { name: `מועדפים: ${PSU.name}` })
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'true')
  })
})

/* ------------------------------------------------------------------------------------------ */

test.describe('forms: labels and error messages', () => {
  const forms = [
    { path: 'login', submit: 'התחברות', fields: 2 },
    { path: 'register', submit: 'יצירת חשבון', fields: 4 },
  ]

  for (const { path, submit, fields } of forms) {
    test(`/${path}: every field has a label and required fields say so`, async ({ page }) => {
      await page.goto(path)

      const inputs = page.locator('main form input')
      await expect(inputs).toHaveCount(fields)
      for (let index = 0; index < fields; index += 1) {
        await expect(inputs.nth(index)).toHaveAccessibleName(/\S/)
        await expect(inputs.nth(index)).toHaveAttribute('required', '')
      }
    })

    test(`/${path}: invalid fields are marked and tied to their error message`, async ({
      page,
    }) => {
      await page.goto(path)

      await page.getByRole('button', { name: submit }).click()

      const invalid = page.locator('main form [aria-invalid="true"]')
      await expect(invalid).toHaveCount(fields)
      for (let index = 0; index < fields; index += 1) {
        const field = invalid.nth(index)
        const describedBy = await field.getAttribute('aria-describedby')
        expect(describedBy, 'aria-describedby points to the message').toBeTruthy()
        // The message is the text of the element it points at (the id may also list a hint).
        const messages = await Promise.all(
          describedBy!.split(' ').map((id) => page.locator(`[id="${id}"]`).textContent()),
        )
        expect(messages.join(' ')).toMatch(/יש|חייב|אינה|אינן/)
      }
      await expect(invalid.first()).toBeFocused()
    })
  }

  test('checkout: labels, required marks and error associations, including the checkbox', async ({
    page,
  }) => {
    await signedInWithCart(page)
    await page.goto('checkout')
    await expect(page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()

    // Fields are grouped in fieldsets with legends.
    await expect(page.getByRole('group', { name: 'פרטי קשר' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'כתובת למשלוח' })).toBeVisible()
    const controls = page.locator('main form input, main form textarea')
    for (let index = 0; index < (await controls.count()); index += 1) {
      await expect(controls.nth(index)).toHaveAccessibleName(/\S/)
    }

    await page.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }).click()

    const invalid = page.locator('main form [aria-invalid="true"]')
    await expect(invalid).toHaveCount(5) // phone, city, street, house number, acknowledgement
    await expect(page.getByLabel('טלפון')).toBeFocused()
    await expect(page.getByLabel('טלפון')).toHaveAccessibleDescription(/יש להזין מספר טלפון/)
    await expect(page.getByRole('checkbox', { name: /הזמנת הדגמה/ })).toHaveAccessibleDescription(
      'יש לאשר שזו הזמנת הדגמה',
    )
  })

  test('a form-level error is announced as an alert', async ({ page }) => {
    await page.goto('login')
    await page.getByLabel('אימייל').fill('nobody@example.com')
    await page.getByLabel(/^סיסמה/).fill('Whatever123')

    await page.getByRole('button', { name: 'התחברות' }).click()

    await expect(page.getByRole('alert')).toHaveText('כתובת האימייל או הסיסמה שגויים')
  })

  test('errors disappear when the field is corrected', async ({ page }) => {
    await page.goto('login')
    await page.getByRole('button', { name: 'התחברות' }).click()
    await expect(page.getByText('יש להזין כתובת אימייל')).toBeVisible()

    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill('a@b.co')

    await expect(page.getByText('יש להזין כתובת אימייל')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'אימייל', exact: true })).not.toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})

/* ------------------------------------------------------------------------------------------ */

async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element) return ''
    return (
      element.getAttribute('aria-label') ||
      (element as HTMLInputElement).placeholder ||
      element.textContent?.trim() ||
      element.tagName
    )
  })
}

test.describe('keyboard', () => {
  test('the skip link is the first stop and moves focus to the main content', async ({ page }) => {
    await page.goto('products')

    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'דלג לתוכן הראשי' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport() // it becomes visible when focused

    await page.keyboard.press('Enter')

    await expect(page.locator('main')).toBeFocused()
  })

  test('tab order follows the visual and reading order of the header', async ({ page }) => {
    await page.goto('')
    const expectedOrder = [
      page.getByRole('link', { name: 'דלג לתוכן הראשי' }),
      header(page).getByRole('link', { name: 'N.M.S - לדף הבית' }),
      header(page)
        .getByRole('navigation', { name: 'ניווט ראשי' })
        .getByRole('link', { name: 'בית' }),
      header(page)
        .getByRole('navigation', { name: 'ניווט ראשי' })
        .getByRole('link', { name: 'מוצרים' }),
      header(page).getByRole('searchbox', { name: 'חיפוש מוצרים' }),
      header(page).getByRole('button', { name: 'חיפוש' }),
      header(page).getByRole('link', { name: 'מועדפים' }),
      header(page).getByRole('link', { name: 'עגלת קניות' }),
      header(page).getByRole('link', { name: 'התחברות' }),
    ]

    for (const stop of expectedOrder) {
      await page.keyboard.press('Tab')
      await expect(stop).toBeFocused()
    }
  })

  test('focused controls have a visible focus indicator', async ({ page }) => {
    await page.goto('products')

    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press('Tab')
      const style = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement
        const indicator = (el: Element) => {
          const computed = getComputedStyle(el)
          return (
            (computed.outlineStyle !== 'none' && computed.outlineWidth !== '0px') ||
            computed.boxShadow !== 'none'
          )
        }
        // The search box is one control: its outline is drawn around the whole box, so for a
        // focused part of it the indicator is on a box inside the search form.
        const search = element.closest('form[role="search"]')
        const candidates = [element, ...(search ? search.querySelectorAll('div') : [])]
        return {
          visible: candidates.some(indicator),
          name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 30),
        }
      })
      const visible = style.visible
      expect(visible, `focus indicator on "${style.name}"`).toBe(true)
    }
  })

  test('searching works entirely from the keyboard', async ({ page }) => {
    await page.goto('')

    await header(page).getByRole('searchbox').focus()
    await page.keyboard.type('intel')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/search\?q=intel$/)
    await expect(page.getByRole('article').first()).toBeVisible()
  })

  test('filters, sorting and add-to-cart work from the keyboard', async ({ page }) => {
    await page.goto('category/cpu')
    await expect(page.getByRole('article').first()).toBeVisible()

    const intel = page.getByRole('group', { name: 'מותג' }).getByRole('checkbox', { name: /Intel/ })
    await intel.focus()
    await page.keyboard.press('Space')
    await expect(page).toHaveURL(/brand=intel$/)
    await expect(intel).toBeChecked()

    const add = page.getByRole('button', { name: /^הוספה לעגלה/ }).first()
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')
  })

  test('navigating to another page moves focus to the content and scrolls to the top', async ({
    page,
  }) => {
    await page.goto('products')
    await expect(page.getByRole('article').first()).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 1500))
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(500)

    await page.getByRole('link', { name: PSU.name, exact: true }).click()

    await expect(page.getByRole('heading', { level: 1, name: PSU.fullName })).toBeVisible()
    await expect(page.locator('main')).toBeFocused()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('the quantity stepper in the cart is operable by keyboard', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')

    const plus = page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` })
    await plus.focus()
    await page.keyboard.press('Enter')

    await expect(page.getByRole('textbox', { name: `כמות ${PSU.name}` })).toHaveValue('2')
    expect(await focusedName(page)).toContain('הגדלת כמות')
  })

  test('the carousel can be used from the keyboard', async ({ page }) => {
    await page.goto('')
    const carousel = page.getByRole('region', { name: 'באנרים' })
    const first = await carousel.getByRole('img').first().getAttribute('alt')

    await carousel.getByRole('button', { name: 'הבא' }).focus()
    await page.keyboard.press('Enter')

    await expect(carousel.getByRole('img').first()).not.toHaveAttribute('alt', first ?? '')
  })
})

/* ------------------------------------------------------------------------------------------ */

test.describe('toasts', () => {
  test('are announced through one live region and have a keyboard-reachable action and close', async ({
    page,
  }) => {
    await page.goto(`products/${PSU.id}`)

    await page.getByRole('button', { name: `הוספה לעגלה: ${PSU.name}` }).click()

    const announcer = page.getByRole('status').filter({ hasText: `${PSU.name} נוסף לעגלה` })
    await expect(announcer).toHaveAttribute('aria-live', 'polite')
    await expect(announcer).toHaveCount(1)
    await expect(toasts(page).getByRole('link', { name: 'לעגלה' })).toBeVisible()
    await toasts(page).getByRole('button', { name: 'סגירת התראה' }).click()
    await expect(toasts(page).getByText(`${PSU.name} נוסף לעגלה`)).toHaveCount(0)
  })

  test('stay while focus is inside them and go away on their own otherwise', async ({ page }) => {
    await page.goto(`products/${PSU.id}`)
    await page.getByRole('button', { name: `הוספה לעגלה: ${PSU.name}` }).click()
    const link = toasts(page).getByRole('link', { name: 'לעגלה' })
    await link.focus()

    await page.waitForTimeout(5600) // longer than the 5 s timeout

    await expect(link).toBeVisible()
    await page.locator('main').focus() // focus leaves the toast
    await expect(link).toHaveCount(0, { timeout: 8000 })
  })
})

/* ------------------------------------------------------------------------------------------ */

test.describe('mobile menu (dialog)', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })

  const toggle = (page: Page) => page.getByRole('button', { name: 'פתיחת תפריט' })
  const menu = (page: Page) => page.getByRole('dialog', { name: 'תפריט ראשי' })

  function activeIsInside(container: Locator) {
    return container.evaluate((element) => element.contains(document.activeElement))
  }

  test('shows the menu button instead of the desktop navigation', async ({ page }) => {
    await page.goto('')

    await expect(toggle(page)).toBeVisible()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(header(page).getByRole('navigation', { name: 'קטגוריות' })).toBeHidden()
    await expect(menu(page)).toBeHidden()
  })

  test('opens as a modal dialog and moves focus into it', async ({ page }) => {
    await page.goto('')

    await toggle(page).click()

    await expect(menu(page)).toBeVisible()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true')
    expect(await activeIsInside(menu(page))).toBe(true)
    await expect(menu(page).getByRole('link', { name: 'מעבדים' })).toBeVisible()
  })

  test('keeps keyboard focus away from the page behind it while it is open', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()

    // Focus is either inside the dialog or (at the ends of the tab order) in the browser's own
    // interface, where nothing on the page is focused. It must never reach the page behind.
    const where = () =>
      menu(page).evaluate((dialog) => {
        const active = document.activeElement
        if (!active || active === document.body || active === document.documentElement)
          return 'browser'
        return dialog.contains(active) ? 'dialog' : 'page behind'
      })
    const seen = new Set<string>()
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab')
      const place = await where()
      expect(place, `after ${step + 1} Tab presses`).not.toBe('page behind')
      seen.add(place)
    }
    for (let step = 0; step < 5; step += 1) {
      await page.keyboard.press('Shift+Tab')
      expect(await where()).not.toBe('page behind')
    }
    expect(seen.has('dialog')).toBe(true)
  })

  test('closes with Escape and returns focus to the button that opened it', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()
    await expect(menu(page)).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(menu(page)).toBeHidden()
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle(page)).toBeFocused()
  })

  test('closes with its close button and by clicking outside', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()
    await menu(page).getByRole('button', { name: 'סגירת תפריט' }).click()
    await expect(menu(page)).toBeHidden()

    await toggle(page).click()
    await expect(menu(page)).toBeVisible()
    // The menu is docked to the right edge (the start side in RTL); click the dimmed area.
    await page.mouse.click(8, 400)
    await expect(menu(page)).toBeHidden()
  })

  test('navigates and closes when a link is chosen', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()

    await menu(page).getByRole('link', { name: 'מעבדים' }).click()

    await expect(page).toHaveURL(/\/category\/cpu$/)
    await expect(menu(page)).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'מעבדים' })).toBeVisible()
  })

  test('has its own search that closes the menu', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()

    await menu(page).getByRole('searchbox', { name: 'חיפוש מוצרים' }).fill('intel')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/search\?q=intel$/)
    await expect(menu(page)).toBeHidden()
  })

  test('offers sign-in, registration and sign-out', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()
    await expect(menu(page).getByRole('link', { name: 'הרשמה' })).toBeVisible()
    await menu(page).getByRole('link', { name: 'התחברות' }).click()
    await expect(page).toHaveURL(/\/login$/)

    await register(page, newAccount())
    // Registering is a request to the API: wait for the redirect to the home page, which would
    // otherwise close a menu that was opened in the meantime.
    await expect(page).toHaveURL(/\/online-store\/$/)
    await toggle(page).click()
    await expect(menu(page).getByText('שלום,')).toBeVisible()
    await menu(page).getByRole('button', { name: 'התנתקות', exact: true }).click()

    // Signed out: the (still open) menu now offers to sign in again.
    await expect(menu(page).getByRole('link', { name: 'התחברות' })).toBeVisible()
    await expect(menu(page).getByRole('button', { name: 'התנתקות', exact: true })).toHaveCount(0)
  })

  test('has no automated WCAG A/AA violations while open', async ({ page }) => {
    await page.goto('')
    await toggle(page).click()
    await expect(menu(page)).toBeVisible()

    await expectNoAxeViolations(page)
  })

  test('has no automated violations on key mobile pages', async ({ page }) => {
    for (const path of ['', 'products', 'category/cpu', `products/${PSU.id}`, 'login']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoAxeViolations(page)
    }
  })

  test('the filter panel on a phone is a disclosure button', async ({ page }) => {
    await page.goto('category/cpu')

    const button = page.getByRole('button', { name: /^סינון/ })
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('group', { name: 'מותג' })).toBeHidden()

    await button.click()

    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('group', { name: 'מותג' })).toBeVisible()
  })

  test('registration form is usable at phone width without horizontal scrolling', async ({
    page,
  }) => {
    await page.goto('register')
    await fillRegistration(page, newAccount())

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    expect(catalog.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------------------------------ */

test.describe('landmarks, heading order and focus on the dark footer', () => {
  const routes = [
    '',
    'products',
    'category/gpu',
    `products/${PSU.id}`,
    'search?q=intel',
    'cart',
    'favorites',
    'login',
    'register',
    'no/such/page',
  ]

  for (const path of routes) {
    test(`/${path}: navigation landmarks have different names and headings do not skip a level`, async ({
      page,
    }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const names = await page.evaluate(() =>
        [...document.querySelectorAll('nav')]
          .filter((nav) => nav.getClientRects().length > 0)
          .map((nav) => {
            const label = nav.getAttribute('aria-label')
            const labelledBy = nav.getAttribute('aria-labelledby')
            return label ?? (labelledBy ? document.getElementById(labelledBy)?.textContent : null)
          }),
      )
      expect(names.every(Boolean), `every navigation has a name: ${names}`).toBe(true)
      expect(new Set(names).size, `names must be unique: ${names}`).toBe(names.length)

      const levels = await page.evaluate(() =>
        [...document.querySelectorAll('main h1, main h2, main h3, main h4')]
          .filter((heading) => heading.getClientRects().length > 0)
          .map((heading) => Number(heading.tagName[1])),
      )
      expect(levels[0]).toBe(1)
      levels.forEach((level, index) => {
        if (index > 0)
          expect(level, `heading order ${levels}`).toBeLessThanOrEqual(levels[index - 1]! + 1)
      })
    })
  }

  test('a footer link shows a light focus outline that can be seen on the dark background', async ({
    page,
  }) => {
    await page.goto('')
    const link = page.getByRole('contentinfo').getByRole('link', { name: 'מעבדים' })

    await page.keyboard.press('Tab')
    await link.focus()

    // The outline colour is animated by the link's colour transition, so wait for it to settle.
    await expect
      .poll(() => link.evaluate((element) => getComputedStyle(element).outlineColor))
      .toBe('rgb(255, 255, 255)')
    const outline = await link.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.outlineWidth, style: style.outlineStyle }
    })
    expect(outline.style).not.toBe('none')
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2)
  })
})
