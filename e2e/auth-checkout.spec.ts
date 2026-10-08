import type { Page } from '@playwright/test'
import { PSU, RAM } from './support/catalog'
import {
  addToCartFromProductPage,
  cartLink,
  expectSignedIn,
  expectSignedOut,
  favoritesLink,
  fillDeliveryForm,
  fillRegistration,
  header,
  newAccount,
  openAccountMenu,
  register,
  signIn,
  signOut,
  summaryTotal,
  type TestAccount,
} from './support/helpers'
import { expect, test } from './support/test'

const ORDER_BUTTON = 'אישור הזמנה (הדגמה)'
const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const toasts = (page: Page) => page.getByRole('region', { name: 'התראות' })
const home = /\/online-store\/$/

/** Registers a fresh account and waits until it is signed in. */
async function registeredAccount(page: Page): Promise<TestAccount> {
  const account = newAccount()
  await register(page, account)
  await expectSignedIn(page)
  return account
}

test.describe('authentication', () => {
  test('registers an account, signs out, and signs in again', async ({ page }) => {
    const account = newAccount()

    await register(page, account)
    await expect(page).toHaveURL(home)
    await expectSignedIn(page)
    // The name is in the account panel, which the "My account" button opens.
    await expect((await openAccountMenu(page)).getByText(account.name)).toBeVisible()
    await expect(toasts(page).getByText('החשבון נוצר ואתם מחוברים')).toBeVisible()

    await signOut(page)
    await expectSignedOut(page)
    await expect(toasts(page).getByText('התנתקתם מהחשבון')).toBeVisible()

    await header(page).getByRole('link', { name: 'התחברות' }).click()
    await expect(page).toHaveURL(/\/online-store\/login$/)
    await signIn(page, account)

    await expect(page).toHaveURL(home)
    await expectSignedIn(page)
  })

  test('says that this is a demo store, and that the account is kept on the server', async ({
    page,
  }) => {
    for (const path of ['login', 'register']) {
      await page.goto(path)
      await expect(page.getByRole('complementary', { name: 'הערה' })).toContainText('אתר הדגמה')
      await expect(page.getByRole('complementary', { name: 'הערה' })).toContainText(
        'נשמר בשרת האתר',
      )
    }
  })

  test('gives the same vague error for a wrong password and an unknown email', async ({ page }) => {
    const account = await registeredAccount(page)
    await signOut(page)
    await page.goto('login')

    await signIn(page, { email: account.email, password: 'Wrong1234pass' })
    const wrongPassword = await page.getByRole('alert').textContent()
    await expect(page.getByRole('alert')).toHaveText('כתובת האימייל או הסיסמה שגויים')

    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill('nobody@example.com')
    await page.getByRole('button', { name: 'התחברות' }).click()

    await expect(page.getByRole('alert')).toHaveText(wrongPassword ?? '')
    await expectSignedOut(page)
  })

  test('does not allow registering an email that is already used, whatever its case', async ({
    page,
  }) => {
    const account = await registeredAccount(page)
    await signOut(page)

    await page.goto('register')
    await fillRegistration(page, { ...account, email: account.email.toUpperCase() })
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()

    await expect(page.getByText('כתובת האימייל כבר רשומה')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'אימייל', exact: true })).toBeFocused()
    await expectSignedOut(page)
  })

  test('validates the login form', async ({ page }) => {
    await page.goto('login')

    await page.getByRole('button', { name: 'התחברות' }).click()

    await expect(page.getByText('יש להזין כתובת אימייל')).toBeVisible()
    await expect(page.getByText('יש להזין סיסמה')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'אימייל', exact: true })).toBeFocused()

    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill('not-an-email')
    await page.getByLabel(/^סיסמה/).fill('x')
    await page.getByRole('button', { name: 'התחברות' }).click()
    await expect(page.getByText('כתובת האימייל אינה תקינה')).toBeVisible()
  })

  test('validates the registration form', async ({ page }) => {
    await page.goto('register')

    await page.getByRole('button', { name: 'יצירת חשבון' }).click()
    for (const message of [
      'יש להזין שם',
      'יש להזין כתובת אימייל',
      'יש להזין סיסמה',
      'יש לאשר את הסיסמה',
    ]) {
      await expect(page.getByText(message)).toBeVisible()
    }
    await expect(page.getByRole('textbox', { name: 'שם', exact: true })).toBeFocused()

    await page.getByRole('textbox', { name: 'שם', exact: true }).fill('דנה')
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill('dana@example.com')
    await page.getByLabel(/^סיסמה/).fill('abcdefgh')
    await page.getByLabel(/^אימות סיסמה/).fill('different')
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()

    await expect(page.getByText('הסיסמה חייבת להכיל לפחות ספרה אחת')).toBeVisible()
    await expect(page.getByText('הסיסמאות אינן תואמות')).toBeVisible()
    await expectSignedOut(page)
  })

  test('keeps the session after a reload', async ({ page }) => {
    await registeredAccount(page)

    await page.reload()

    await expectSignedIn(page)
  })

  test('keeps only a session token in the browser: no password, no hash, no account', async ({
    page,
  }) => {
    const account = await registeredAccount(page)

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    const session = await page.evaluate(() => localStorage.getItem('online-store:session') ?? '')

    expect(stored).not.toContain(account.password)
    expect(stored).not.toContain(account.email)
    expect(stored).not.toMatch(/passwordHash|scrypt/)
    expect(JSON.parse(session).state).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expiresAt: expect.any(String),
    })
    expect(await page.evaluate(() => document.cookie)).toBe('')
  })

  test('asks the API from another origin with a Bearer token, and sends no cookies', async ({
    page,
  }) => {
    const account = await registeredAccount(page)
    const token = JSON.parse(
      await page.evaluate(() => localStorage.getItem('online-store:session') ?? ''),
    ).state.token

    const meRequest = page.waitForRequest((request) => request.url().endsWith('/api/auth/me'))
    await page.reload()
    const request = await meRequest

    expect(new URL(request.url()).origin).not.toBe(new URL(page.url()).origin)
    expect(request.headers()['authorization']).toBe(`Bearer ${token}`)
    expect(request.headers()['cookie']).toBeUndefined()
    expect(new URL(request.url()).search).toBe('')
    await expectSignedIn(page)
    await expect((await openAccountMenu(page)).getByText(account.name)).toBeVisible()
  })

  test('lets the same account sign in from another browser, as a session of its own', async ({
    page,
    browser,
  }) => {
    const account = await registeredAccount(page)

    const other = await browser.newContext({ locale: 'he-IL' })
    const otherPage = await other.newPage()
    await otherPage.goto('')
    await expectSignedOut(otherPage)

    // The account is on the server, so any browser can sign in to it.
    await otherPage.goto('login')
    await signIn(otherPage, account)
    await expect(otherPage).toHaveURL(home)
    await expectSignedIn(otherPage)

    // Signing out of one browser does not sign out the other.
    await signOut(page)
    await expectSignedOut(page)
    await otherPage.reload()
    await expectSignedIn(otherPage)
    await other.close()
  })

  test('signs out everywhere: every browser of the account is signed out, another account is not', async ({
    page,
    browser,
  }) => {
    const account = await registeredAccount(page)
    const phone = await browser.newContext({ locale: 'he-IL' })
    const phonePage = await phone.newPage()
    await phonePage.goto('login')
    await signIn(phonePage, account)
    await expectSignedIn(phonePage)
    const stranger = await browser.newContext({ locale: 'he-IL' })
    const strangerPage = await stranger.newPage()
    await register(strangerPage, newAccount())
    await expectSignedIn(strangerPage)

    // The account panel of the header has the button; one click ends every session of the account.
    await (
      await openAccountMenu(page)
    )
      .getByRole('button', { name: 'התנתקות מכל המכשירים' })
      .click()

    await expectSignedOut(page)
    await expect(toasts(page).getByText('התנתקתם מכל המכשירים')).toBeVisible()
    // The other browser is signed out at its next request, not only when it signs out itself...
    await phonePage.reload()
    await expectSignedOut(phonePage)
    expect(
      await phonePage.evaluate(() => localStorage.getItem('online-store:session')),
    ).not.toMatch(/[A-Za-z0-9_-]{43}/)
    // ...and the account can sign in again, while somebody else's session was never touched.
    await phonePage.goto('login')
    await signIn(phonePage, account)
    await expectSignedIn(phonePage)
    await strangerPage.reload()
    await expectSignedIn(strangerPage)
    await phone.close()
    await stranger.close()
  })

  test('ends the session on the server when signing out: the token stops working', async ({
    page,
    request,
  }) => {
    await registeredAccount(page)
    const token = JSON.parse(
      await page.evaluate(() => localStorage.getItem('online-store:session') ?? ''),
    ).state.token
    const me = (bearer?: string) =>
      request.get(
        `${API}/api/auth/me`,
        bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : {},
      )
    expect((await me(token)).status()).toBe(200)

    await signOut(page)
    await expectSignedOut(page)

    await expect.poll(async () => (await me(token)).status()).toBe(401)
    expect((await me()).status()).toBe(401)
  })

  test('does not sign in a browser that carries a token the server has ended', async ({
    page,
    browser,
  }) => {
    await registeredAccount(page)
    const session = await page.evaluate(() => localStorage.getItem('online-store:session') ?? '')
    await signOut(page)

    const other = await browser.newContext({ locale: 'he-IL' })
    await other.addInitScript(
      (value) => localStorage.setItem('online-store:session', value),
      session,
    )
    const otherPage = await other.newPage()
    await otherPage.goto('checkout')

    // Not the checkout: the server does not know the token, so it is the login page.
    await expect(otherPage).toHaveURL(/\/online-store\/login$/)
    await expectSignedOut(otherPage)
    expect(
      await otherPage.evaluate(() => localStorage.getItem('online-store:session')),
    ).not.toContain(JSON.parse(session).state.token)
    await other.close()
  })

  test('blocks an email after five wrong passwords, and says to wait', async ({ page }) => {
    const account = await registeredAccount(page)
    await signOut(page)
    await page.goto('login')

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn(page, { email: account.email, password: 'Wrong1234pass' })
      await expect(page.getByRole('alert')).toHaveText('כתובת האימייל או הסיסמה שגויים')
    }
    await signIn(page, account)

    await expect(page.getByRole('alert')).toContainText('יותר מדי ניסיונות')
    await expectSignedOut(page)
  })

  test('sends a signed-in visitor away from the login and registration pages', async ({ page }) => {
    await registeredAccount(page)

    await page.goto('login')
    await expect(page).toHaveURL(home)
    await page.goto('register')
    await expect(page).toHaveURL(home)
  })

  test('keeps the cart and favorites when signing in, and empties only the cart when signing out', async ({
    page,
  }) => {
    const account = newAccount()
    await addToCartFromProductPage(page, PSU)
    await page.getByRole('button', { name: `מועדפים: ${PSU.name}` }).click()
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')

    await register(page, account)
    await expectSignedIn(page)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')

    await signOut(page)

    // The cart belongs to the account, which keeps it; the favorites belong to this browser.
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות')
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')
  })
})

test.describe('protected checkout', () => {
  test('sends a signed-out visitor to the login page', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)

    await page.goto('checkout')

    await expect(page).toHaveURL(/\/online-store\/login$/)
    await expect(page.getByRole('heading', { level: 1, name: 'התחברות' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'סיום הזמנה' })).toHaveCount(0)
  })

  test('also protects the order page', async ({ page }) => {
    await page.goto('orders/DEMO-ABCDEFGH')

    await expect(page).toHaveURL(/\/online-store\/login$/)
  })

  test('returns to checkout after signing in', async ({ page }) => {
    const account = await registeredAccount(page)
    await signOut(page)
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')
    await expect(page).toHaveURL(/\/login$/)

    await signIn(page, account)

    await expect(page).toHaveURL(/\/online-store\/checkout$/)
    await expect(page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()
  })

  test('returns to checkout after registering through the login page link', async ({ page }) => {
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')
    await expect(page.getByText('כדי להמשיך תתבקשו להתחבר או להירשם.')).toBeVisible()

    await page.getByRole('link', { name: 'מעבר לסיום ההזמנה' }).click()
    await expect(page).toHaveURL(/\/online-store\/login$/)
    await page.getByRole('link', { name: 'הרשמה' }).click()
    await expect(page).toHaveURL(/\/online-store\/register$/)
    await fillRegistration(page, newAccount())
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()

    await expect(page).toHaveURL(/\/online-store\/checkout$/)
  })

  test('shows an empty state instead of the form when the cart is empty', async ({ page }) => {
    await registeredAccount(page)

    await page.goto('checkout')

    await expect(page.getByText('העגלה ריקה')).toBeVisible()
    await expect(page.getByRole('button', { name: ORDER_BUTTON })).toHaveCount(0)
  })
})

test.describe('checkout', () => {
  test('places an order with the API: the confirmation appears and the cart is emptied', async ({
    page,
  }) => {
    await page.goto('products')
    await page.getByRole('button', { name: `מועדפים: ${RAM.name}` }).click()
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')
    await page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` }).click()
    await expect.poll(() => summaryTotal(page)).toBe(2 * PSU.price.current)

    // Signed out: checkout sends the visitor to register first, then back.
    await page.getByRole('link', { name: 'מעבר לסיום ההזמנה' }).click()
    await page.getByRole('link', { name: 'הרשמה' }).click()
    const account = newAccount()
    await fillRegistration(page, account)
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()

    // Name and email come from the account; the summary matches the cart.
    await expect(page.getByLabel('שם מלא')).toHaveValue(account.name)
    await expect(page.getByRole('textbox', { name: 'אימייל', exact: true })).toHaveValue(
      account.email,
    )
    await expect.poll(() => summaryTotal(page)).toBe(2 * PSU.price.current)

    await fillDeliveryForm(page)
    await page.getByRole('button', { name: ORDER_BUTTON }).click()

    await expect(page).toHaveURL(/\/online-store\/orders\/DEMO-[0-9A-Z]{8}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })).toBeVisible()
    await expect(page.getByText(/DEMO-[0-9A-Z]{8}/).first()).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'הערה' })).toContainText('לא בוצע חיוב')
    await expect(
      page.getByRole('list', { name: 'המוצרים שהוזמנו' }).getByRole('listitem'),
    ).toHaveCount(1)
    await expect.poll(() => summaryTotal(page)).toBe(2 * PSU.price.current)

    // The cart is empty afterwards; favorites and the session are untouched.
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות')
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')
    await expectSignedIn(page)
    await page.goto('cart')
    await expect(page.getByText('העגלה ריקה')).toBeVisible()
  })

  test('rejects an invalid delivery form and places no order', async ({ page }) => {
    await registeredAccount(page)
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')

    await page.getByRole('button', { name: ORDER_BUTTON }).click()

    for (const message of [
      'יש להזין מספר טלפון',
      'יש להזין עיר',
      'יש להזין רחוב',
      'יש להזין מספר בית',
      'יש לאשר שזו הזמנת הדגמה',
    ]) {
      await expect(page.getByText(message)).toBeVisible()
    }
    await expect(page.getByLabel('טלפון')).toBeFocused()
    await expect(page).toHaveURL(/\/online-store\/checkout$/)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')
  })

  test('rejects a bad phone number and postal code', async ({ page }) => {
    await registeredAccount(page)
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')

    await fillDeliveryForm(page)
    await page.getByLabel('טלפון').fill('12345')
    await page.getByLabel('מיקוד (לא חובה)').fill('123')
    await page.getByRole('button', { name: ORDER_BUTTON }).click()

    await expect(page.getByText('מספר הטלפון אינו תקין')).toBeVisible()
    await expect(page.getByText('המיקוד חייב להכיל 7 ספרות')).toBeVisible()
    await expect(page).toHaveURL(/\/online-store\/checkout$/)
  })

  test('says so when the order that is opened does not exist', async ({ page }) => {
    await registeredAccount(page)

    await page.goto('orders/DEMO-ZZZZZZZZ')

    await expect(page.getByRole('heading', { level: 1, name: 'ההזמנה לא נמצאה' })).toBeVisible()
  })
})

test.describe('sign-out regression', () => {
  test('signing out on the checkout page returns to the home page, not to the login page', async ({
    page,
  }) => {
    await registeredAccount(page)
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')
    await expect(page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()

    await signOut(page)

    await expect(page).toHaveURL(home)
    await expectSignedOut(page)
    // It must stay there (no late redirect back to the login page).
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(home)
    await expect(page.getByRole('heading', { level: 1, name: 'חנות רכיבי מחשב' })).toBeVisible()
  })

  test('signing out on the confirmation page returns to the home page', async ({ page }) => {
    await registeredAccount(page)
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')
    await fillDeliveryForm(page)
    await page.getByRole('button', { name: ORDER_BUTTON }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })).toBeVisible()

    await signOut(page)

    await expect(page).toHaveURL(home)
    await expectSignedOut(page)
    await page.waitForTimeout(600)
    await expect(page).toHaveURL(home)
  })

  test('signing out on a public page stays on that page', async ({ page }) => {
    await registeredAccount(page)
    await page.goto(`products/${PSU.id}`)

    await signOut(page)

    await expectSignedOut(page)
    await expect(page).toHaveURL(new RegExp(`/online-store/products/${PSU.id}/?$`))
    await expect(page.getByRole('heading', { level: 1, name: PSU.fullName })).toBeVisible()
  })

  test('the checkout is locked again after signing out', async ({ page }) => {
    await registeredAccount(page)
    await addToCartFromProductPage(page, PSU)
    await signOut(page)

    await page.goto('checkout')

    await expect(page).toHaveURL(/\/online-store\/login$/)
  })
})
