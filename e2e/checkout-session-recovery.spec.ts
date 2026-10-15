import type { Browser, BrowserContext, Page } from '@playwright/test'
import { PSU, RAM } from './support/catalog'
import {
  addToCartFromProductPage,
  expectSignedIn,
  expectSignedOut,
  fillDeliveryForm,
  header,
  newAccount,
  openAccountMenu,
  register,
  signIn,
  signOut,
  type TestAccount,
} from './support/helpers'
import { expect, test } from './support/test'

/**
 * A session that ends while the visitor is on the checkout, in a real browser against the real API
 * code: the order is refused with 401, the visitor is sent to the login page and told why, signs in,
 * and finds the checkout again with the delivery details they typed and the cart of the account. The
 * "this is a demo" tick is theirs to give again, and the details come back once, to the same account.
 *
 * The session is ended the way it ends for a visitor: the same account signs in from another browser
 * and signs out of every device.
 */

const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const ORDER_BUTTON = 'אישור הזמנה (הדגמה)'
const SESSION_ENDED = 'ההתחברות הסתיימה. התחברו שוב כדי להמשיך להזמנה.'
const RESTORED = 'שחזרנו את פרטי המשלוח שמילאתם. בדקו אותם ואשרו שוב שזו הזמנת הדגמה.'
const DRAFT_KEY = 'online-store:checkout-draft'

const storedDraft = (page: Page) => page.evaluate((key) => sessionStorage.getItem(key), DRAFT_KEY)
const city = (page: Page) => page.getByRole('textbox', { name: 'עיר', exact: true })
const street = (page: Page) => page.getByRole('textbox', { name: 'רחוב', exact: true })
const phone = (page: Page) => page.getByRole('textbox', { name: 'טלפון', exact: true })
const houseNumber = (page: Page) => page.getByRole('textbox', { name: 'מספר בית', exact: true })
const demoTick = (page: Page) => page.getByRole('checkbox', { name: /הזמנת הדגמה/ })
const checkoutHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })

async function orderCount(page: Page) {
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('online-store:session') ?? '{}').state?.token as string,
  )
  const response = await page.request.get(`${API}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return ((await response.json()) as { total: number }).total
}

/** A registered account with two products in its cart, on the checkout with the form filled in. */
async function onTheFilledCheckout(page: Page): Promise<TestAccount> {
  const account = newAccount()
  await register(page, account)
  await expectSignedIn(page)
  await addToCartFromProductPage(page, PSU)
  await addToCartFromProductPage(page, RAM)
  await page.goto('checkout')
  await expect(checkoutHeading(page)).toBeVisible()
  await fillDeliveryForm(page)
  return account
}

/** The same account signs in elsewhere and signs out of every device: the session of `page` is over. */
async function endEverySession(browser: Browser, account: TestAccount) {
  const elsewhere: BrowserContext = await browser.newContext({ locale: 'he-IL' })
  const elsewherePage = await elsewhere.newPage()
  await elsewherePage.goto('login')
  await signIn(elsewherePage, account)
  await expectSignedIn(elsewherePage)
  await (
    await openAccountMenu(elsewherePage)
  )
    .getByRole('button', { name: 'התנתקות מכל המכשירים' })
    .click()
  await expectSignedOut(elsewherePage)
  await elsewhere.close()
}

/** The visitor presses the order button after the session ended: refused, and sent to the login page. */
async function orderAfterTheSessionEnded(page: Page) {
  await page.getByRole('button', { name: ORDER_BUTTON }).click()
  await expect(page).toHaveURL(/\/online-store\/login$/)
}

test.describe('a session that ends on the checkout', () => {
  test('is told why, signs in, and finds the checkout again with the details, the cart and no tick', async ({
    page,
    browser,
  }) => {
    const account = await onTheFilledCheckout(page)
    await endEverySession(browser, account)

    await orderAfterTheSessionEnded(page)

    await expectSignedOut(page)
    await expect(page.getByText(SESSION_ENDED)).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('online-store:session'))).not.toMatch(
      /[A-Za-z0-9_-]{43}/,
    )

    await signIn(page, account)

    await expect(page).toHaveURL(/\/online-store\/checkout$/)
    await expect(checkoutHeading(page)).toBeVisible()
    await expect(page.getByText(RESTORED)).toBeVisible()
    await expect(phone(page)).toHaveValue('0501234567')
    await expect(city(page)).toHaveValue('תל אביב')
    await expect(street(page)).toHaveValue('דיזנגוף')
    await expect(houseNumber(page)).toHaveValue('12')
    await expect(demoTick(page)).not.toBeChecked()
    // The cart of the account came back with the sign-in.
    await expect(
      page.getByRole('list', { name: 'המוצרים בהזמנה' }).getByRole('listitem'),
    ).toHaveCount(2)
    // The draft is used by opening the page: it is not in the tab any more.
    expect(await storedDraft(page)).toBeNull()

    // Without the tick no order is placed; with it, exactly one.
    await page.getByRole('button', { name: ORDER_BUTTON }).click()
    await expect(page.getByText('יש לאשר שזו הזמנת הדגמה')).toBeVisible()
    expect(await orderCount(page)).toBe(0)

    await demoTick(page).check()
    await page.getByRole('button', { name: ORDER_BUTTON }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })).toBeVisible()
    expect(await orderCount(page)).toBe(1)
  })

  test('keeps only the delivery details in the tab: no tick, no token, no password, nothing in localStorage', async ({
    page,
    browser,
  }) => {
    const account = await onTheFilledCheckout(page)
    const token = await page.evaluate(
      () => JSON.parse(localStorage.getItem('online-store:session') ?? '{}').state?.token as string,
    )
    await endEverySession(browser, account)

    await orderAfterTheSessionEnded(page)

    const draft = await storedDraft(page)
    expect(draft).not.toBeNull()
    const parsed = JSON.parse(draft!) as { details: Record<string, string> }
    expect(parsed.details).toEqual({
      fullName: account.name,
      email: account.email,
      phone: '0501234567',
      city: 'תל אביב',
      street: 'דיזנגוף',
      houseNumber: '12',
      apartment: '',
      postalCode: '',
      notes: '',
    })
    for (const secret of [token, account.password, 'acceptDemo']) {
      expect(draft).not.toContain(secret)
    }
    const local = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    expect(local).not.toContain('0501234567')
    expect(local).not.toContain('דיזנגוף')
  })

  test('brings the details back once: a reload of the checkout finds a blank form', async ({
    page,
    browser,
  }) => {
    const account = await onTheFilledCheckout(page)
    await endEverySession(browser, account)
    await orderAfterTheSessionEnded(page)
    await signIn(page, account)
    await expect(page.getByText(RESTORED)).toBeVisible()
    await expect(street(page)).toHaveValue('דיזנגוף')

    await page.reload()

    await expect(checkoutHeading(page)).toBeVisible()
    await expect(phone(page)).toBeVisible()
    await expect(page.getByText(RESTORED)).toHaveCount(0)
    await expect(street(page)).toHaveValue('')
    await expect(phone(page)).toHaveValue('')
  })

  test('waits through a reload of the login page, and the sign-in still leads back to the checkout', async ({
    page,
    browser,
  }) => {
    const account = await onTheFilledCheckout(page)
    await endEverySession(browser, account)
    await orderAfterTheSessionEnded(page)

    await page.reload()

    await expect(page.getByRole('heading', { level: 1, name: 'התחברות' })).toBeVisible()
    expect(await storedDraft(page)).not.toBeNull()
    await signIn(page, account)
    await expect(page).toHaveURL(/\/online-store\/checkout$/)
    await expect(street(page)).toHaveValue('דיזנגוף')
  })

  test('does not hand the details to another account that signs in on that login page', async ({
    page,
    browser,
  }) => {
    const account = await onTheFilledCheckout(page)
    await endEverySession(browser, account)
    await orderAfterTheSessionEnded(page)
    expect(await storedDraft(page)).not.toBeNull()

    // Somebody else takes the browser: they register through the link, which keeps the destination.
    const other = newAccount()
    await page.getByRole('link', { name: 'הרשמה' }).click()
    await page.getByRole('textbox', { name: 'שם', exact: true }).fill(other.name)
    await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(other.email)
    await page.getByLabel(/^סיסמה/).fill(other.password)
    await page.getByLabel(/^אימות סיסמה/).fill(other.password)
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()

    await expectSignedIn(page)
    expect(await storedDraft(page)).toBeNull()
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')
    await expect(checkoutHeading(page)).toBeVisible()
    await expect(phone(page)).toBeVisible()
    await expect(page.getByText(RESTORED)).toHaveCount(0)
    await expect(street(page)).toHaveValue('')
    await expect(phone(page)).toHaveValue('')
    await expect(page.locator('body')).not.toContainText('דיזנגוף')
  })

  test('leaves nothing behind when the visitor signs out by choice', async ({ page, browser }) => {
    const account = await onTheFilledCheckout(page)
    await endEverySession(browser, account)
    await orderAfterTheSessionEnded(page)
    expect(await storedDraft(page)).not.toBeNull()

    // Signs in from the header link, not through the redirect, so the checkout does not open and use it.
    await page.goto('')
    await header(page).getByRole('link', { name: 'התחברות' }).click()
    await signIn(page, account)
    await expectSignedIn(page)
    await expect(page).toHaveURL(/\/online-store\/$/)
    expect(await storedDraft(page)).not.toBeNull()

    await signOut(page)

    await expectSignedOut(page)
    expect(await storedDraft(page)).toBeNull()
  })

  test('does not tell a visitor who was simply not signed in that a session ended', async ({
    page,
  }) => {
    await page.goto('checkout')

    await expect(page).toHaveURL(/\/online-store\/login$/)
    await expect(page.getByRole('heading', { level: 1, name: 'התחברות' })).toBeVisible()
    await expect(page.getByText(SESSION_ENDED)).toHaveCount(0)
  })
})
