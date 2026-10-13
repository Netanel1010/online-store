import type { Page } from '@playwright/test'
import { PSU } from './support/catalog'
import {
  addToCartFromProductPage,
  cartLink,
  expectSignedIn,
  fillDeliveryForm,
  newAccount,
  openAccountMenu,
  register,
  summaryTotal,
} from './support/helpers'
import { expect, test } from './support/test'

const ORDER_BUTTON = 'אישור הזמנה (הדגמה)'
const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const ORDER_URL = /\/online-store\/orders\/(DEMO-[0-9A-Z]{8})$/

interface StoredOrder {
  orderNumber: string
  total: number
  delivery: { street: string; phone: string; postalCode: string; notes: string }
}

/** Registers a fresh account, puts the power supply in its cart and opens the checkout. */
async function checkoutWithOneProduct(page: Page) {
  await register(page, newAccount())
  await expectSignedIn(page)
  await addToCartFromProductPage(page, PSU)
  await page.goto('checkout')
  await expect(page.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()
  await fillDeliveryForm(page)
}

const order = (page: Page) => page.getByRole('button', { name: ORDER_BUTTON })

async function confirmed(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'ההזמנה התקבלה' })).toBeVisible()
  await expect(page).toHaveURL(ORDER_URL)
}

/** The orders the API holds for the signed-in account, asked the way the page asks. */
async function accountOrders(page: Page) {
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('online-store:session') ?? '{}').state?.token as string,
  )
  const response = await page.request.get(`${API}/api/orders`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as { total: number; items: StoredOrder[] }
}

/** The Idempotency-Key of every order request the page sends. */
function recordOrderKeys(page: Page) {
  const keys: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/orders$/.test(request.url())) {
      keys.push(request.headers()['idempotency-key'] ?? '')
    }
  })
  return keys
}

/** Changes the body of the first order request only, and lets it go to the real API. */
async function alterFirstOrderRequest(page: Page, change: (body: Record<string, unknown>) => void) {
  let altered = false
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST' || altered) return route.fallback()
    altered = true
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    change(body)
    await route.continue({ postData: JSON.stringify(body) })
  })
}

test.describe('an order is kept by the API', () => {
  test('opens again after a reload and in another tab, with the same number, lines and total', async ({
    page,
  }) => {
    await checkoutWithOneProduct(page)
    await order(page).click()
    await confirmed(page)
    const number = ORDER_URL.exec(page.url())![1]!
    await expect(page.getByText(number).first()).toBeVisible()

    await page.reload()
    await confirmed(page)
    await expect(page.getByText(number).first()).toBeVisible()
    await expect.poll(() => summaryTotal(page)).toBe(PSU.price.current)

    // A fresh page has no router state at all: the order comes from the API alone.
    const other = await page.context().newPage()
    await other.goto(`orders/${number}`)
    await expect(other.getByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeVisible()
    await expect(other.getByText(number).first()).toBeVisible()
    await expect(other.getByRole('list', { name: 'המוצרים שהוזמנו' })).toContainText(PSU.name)
    await expect(other.getByRole('region', { name: 'פרטי משלוח' })).toContainText('דיזנגוף')
    await expect.poll(() => summaryTotal(other)).toBe(PSU.price.current)
  })

  test('keeps the delivery details on the server and not in the browser', async ({ page }) => {
    await checkoutWithOneProduct(page)
    await order(page).click()
    await confirmed(page)

    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    expect(stored).not.toContain('דיזנגוף')
    expect(stored).not.toContain('1234567')
    expect(stored).not.toContain('DEMO-')

    const { total, items } = await accountOrders(page)
    expect(total).toBe(1)
    expect(items[0]!.delivery).toMatchObject({ street: 'דיזנגוף', phone: '0501234567' })
    expect(items[0]!.total).toBe(PSU.price.current)
  })

  test('stores the phone number written locally, and refuses a city that is not a name', async ({
    page,
  }) => {
    await checkoutWithOneProduct(page)
    await page.getByLabel('טלפון').fill('+972 50-123-4567')
    const city = page.getByRole('textbox', { name: 'עיר', exact: true })
    await city.fill('=cmd|calc')

    await order(page).click()

    await expect(page.getByText('עיר מכיל תווים שאינם מותרים')).toBeVisible()
    await expect(page).toHaveURL(/\/checkout$/)
    expect((await accountOrders(page)).total).toBe(0)

    await city.fill('תל אביב')
    await order(page).click()
    await confirmed(page)

    const { total, items } = await accountOrders(page)
    expect(total).toBe(1)
    expect(items[0]!.delivery).toMatchObject({ phone: '0501234567' })
  })

  test('does not read a tab among the digits of a phone number or a postal code as a separator', async ({
    page,
  }) => {
    await checkoutWithOneProduct(page)
    const phone = page.getByLabel('טלפון')
    const postalCode = page.getByLabel('מיקוד (לא חובה)')
    await phone.fill('050\t1234567')
    await postalCode.fill('64369\t01')

    await order(page).click()

    await expect(page.getByText('מספר הטלפון אינו תקין')).toBeVisible()
    await expect(page.getByText('המיקוד חייב להכיל 7 ספרות')).toBeVisible()
    await expect(page).toHaveURL(/\/checkout$/)
    expect((await accountOrders(page)).total).toBe(0)

    await phone.fill('050-1234567')
    await postalCode.fill('64-369-01')
    await order(page).click()
    await confirmed(page)

    const { items } = await accountOrders(page)
    expect(items[0]!.delivery).toMatchObject({ phone: '0501234567', postalCode: '6436901' })
  })

  test('says how long a note may be, and keeps a long paste whole until the visitor decides', async ({
    page,
  }) => {
    await checkoutWithOneProduct(page)
    const notes = page.getByRole('textbox', { name: /הערות למשלוח/ })
    await expect(page.getByText('עד 300 תווים', { exact: true })).toBeVisible()
    await expect(notes).toHaveAccessibleDescription('עד 300 תווים')
    await expect(notes).not.toHaveAttribute('maxlength')

    await notes.click()
    await page.keyboard.insertText('🙏'.repeat(301))
    expect(Array.from(await notes.inputValue())).toHaveLength(301)
    await order(page).click()
    await expect(page.getByText('ההערות ארוכות מדי (עד 300 תווים)')).toBeVisible()
    await expect(notes).toHaveAccessibleDescription('עד 300 תווים ההערות ארוכות מדי (עד 300 תווים)')
    expect((await accountOrders(page)).total).toBe(0)

    await notes.press('Backspace')
    await expect(page.getByText('ההערות ארוכות מדי (עד 300 תווים)')).toHaveCount(0)
    await order(page).click()
    await confirmed(page)
    const { items } = await accountOrders(page)
    expect(Array.from(items[0]!.delivery.notes)).toHaveLength(300)
  })

  test('says on the checkout that the order is saved in the account', async ({ page }) => {
    await checkoutWithOneProduct(page)

    await expect(page.getByRole('checkbox', { name: /נשמרים בחשבון שלי/ })).toBeVisible()
    await expect(page.getByRole('complementary', { name: 'הערה' })).toContainText('נשמרים בחשבון')
  })

  test('does not show the order to another account', async ({ page, browser }, testInfo) => {
    await checkoutWithOneProduct(page)
    await order(page).click()
    await confirmed(page)
    const number = ORDER_URL.exec(page.url())![1]!

    const stranger = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
    const strangerPage = await stranger.newPage()
    await register(strangerPage, newAccount())
    await expectSignedIn(strangerPage)
    await strangerPage.goto(`orders/${number}`)

    await expect(
      strangerPage.getByRole('heading', { level: 1, name: 'ההזמנה לא נמצאה' }),
    ).toBeVisible()
    await expect(strangerPage.getByText('דיזנגוף')).toHaveCount(0)
    await stranger.close()
  })
})

test.describe('placing the order twice', () => {
  test('a double click places one order', async ({ page }) => {
    const keys = recordOrderKeys(page)
    await checkoutWithOneProduct(page)

    await order(page).dblclick()
    await confirmed(page)

    expect(keys).toHaveLength(1)
    expect((await accountOrders(page)).total).toBe(1)
  })

  test('repeats the request with the same key when the host is busy, and still places one order', async ({
    page,
  }) => {
    const keys = recordOrderKeys(page)
    let refused = false
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST' || refused) return route.fallback()
      refused = true
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'server_busy', message: 'Busy' } }),
      })
    })
    await checkoutWithOneProduct(page)

    await order(page).click()
    await confirmed(page)

    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect((await accountOrders(page)).total).toBe(1)
  })
})

test.describe('an order whose answer was lost', () => {
  /**
   * The first order request reaches the API, which makes the order; the browser gets back something
   * that is not the order (what a proxy that cuts an answer short sends), so it cannot tell. A
   * dropped connection would say the same to the page, but the suite fails any request that fails.
   */
  async function loseTheFirstAnswer(page: Page) {
    let lost = false
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() !== 'POST' || lost) return route.fallback()
      lost = true
      const response = await route.fetch()
      await route.fulfill({
        response,
        status: 200,
        contentType: 'text/html',
        body: '<html>The gateway cut the answer short</html>',
      })
    })
  }

  const street = (page: Page) => page.getByRole('textbox', { name: 'רחוב', exact: true })

  test('an edited retry shows the order that exists and places no second one', async ({ page }) => {
    const keys = recordOrderKeys(page)
    await loseTheFirstAnswer(page)
    await checkoutWithOneProduct(page)

    await order(page).click()
    await expect(page.getByRole('alert')).toContainText('לא הצלחנו להשלים את ההזמנה')
    expect((await accountOrders(page)).total).toBe(1)
    await street(page).fill('אלנבי')
    await order(page).click()

    const notice = page.getByRole('alert')
    await expect(notice).toContainText('כבר נקלטה')
    const [placed] = (await accountOrders(page)).items
    await expect(notice).toContainText(placed!.orderNumber)
    expect((await accountOrders(page)).total).toBe(1)
    expect(placed!.delivery.street).toBe('דיזנגוף')
    // The edit is still in the form, and the same key went with it.
    await expect(street(page)).toHaveValue('אלנבי')
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    await expect(page).toHaveURL(/\/online-store\/checkout$/)
  })

  test('after a reload the page finds the order on its own, and a separate order needs a confirmation', async ({
    page,
  }) => {
    await loseTheFirstAnswer(page)
    await checkoutWithOneProduct(page)
    await order(page).click()
    await expect(page.getByRole('alert')).toContainText('לא הצלחנו להשלים את ההזמנה')

    await page.reload()

    const notice = page.getByRole('alert')
    await expect(notice).toContainText('כבר נקלטה')
    await expect(notice).toContainText('בדקו אותה לפני שתמשיכו')
    expect((await accountOrders(page)).total).toBe(1)

    await fillDeliveryForm(page)
    await street(page).fill('אלנבי')
    await notice.getByRole('button', { name: 'הזמנה נפרדת בפרטים שהזנתי עכשיו' }).click()
    await expect(
      notice.getByText('האם ליצור הזמנה חדשה? פעולה זו תיצור הזמנה נוספת בנוסף להזמנה שכבר נקלטה.'),
    ).toBeVisible()
    expect((await accountOrders(page)).total).toBe(1)

    await notice.getByRole('button', { name: 'כן, ליצור הזמנה חדשה' }).click()

    await confirmed(page)
    const orders = await accountOrders(page)
    expect(orders.total).toBe(2)
    expect(orders.items.map((o) => o.delivery.street).sort()).toEqual(['אלנבי', 'דיזנגוף'])
  })
})

test.describe('what the API refuses', () => {
  test('tells the visitor when the total is not what was shown, then orders at the total the API has', async ({
    page,
  }) => {
    await alterFirstOrderRequest(page, (body) => {
      body.expectedTotal = (body.expectedTotal as number) + 1
    })
    await checkoutWithOneProduct(page)

    await order(page).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('המחיר השתנה')
    await expect(alert).toContainText(PSU.price.current.toLocaleString('en-US'))
    await expect(page).toHaveURL(/\/online-store\/checkout$/)
    expect((await accountOrders(page)).total).toBe(0)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')

    await order(page).click()
    await confirmed(page)
    const { total, items } = await accountOrders(page)
    expect(total).toBe(1)
    expect(items[0]!.total).toBe(PSU.price.current)
  })

  test('refuses the order when a product is not available, and keeps the cart', async ({
    page,
  }) => {
    await alterFirstOrderRequest(page, (body) => {
      body.items = [{ productId: 'NO-SUCH-SKU', quantity: 1 }]
    })
    await checkoutWithOneProduct(page)

    await order(page).click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('אינם זמינים עוד')
    await expect(alert).toContainText('NO-SUCH-SKU')
    await expect(page).toHaveURL(/\/online-store\/checkout$/)
    expect((await accountOrders(page)).total).toBe(0)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')

    await order(page).click()
    await confirmed(page)
    expect((await accountOrders(page)).total).toBe(1)
  })
})

test.describe('the orders of the account', () => {
  test('lists them newest first from the menu, and opens one', async ({ page }) => {
    await checkoutWithOneProduct(page)
    await order(page).click()
    await confirmed(page)
    const first = ORDER_URL.exec(page.url())![1]!

    // A second order, of two units, so that the two can be told apart.
    await addToCartFromProductPage(page, PSU)
    await addToCartFromProductPage(page, PSU)
    await page.goto('checkout')
    await fillDeliveryForm(page)
    await order(page).click()
    await confirmed(page)
    const second = ORDER_URL.exec(page.url())![1]!
    expect(second).not.toBe(first)

    await (await openAccountMenu(page)).getByRole('link', { name: 'ההזמנות שלי' }).click()

    await expect(page).toHaveURL(/\/online-store\/orders$/)
    await expect(page.getByRole('heading', { level: 1, name: 'ההזמנות שלי' })).toBeVisible()
    const cards = page.getByRole('list', { name: 'ההזמנות שלי' }).getByRole('listitem')
    await expect(cards).toHaveCount(2)
    await expect(cards.nth(0).getByRole('heading')).toHaveText(second)
    await expect(cards.nth(0)).toContainText((2 * PSU.price.current).toLocaleString('en-US'))
    await expect(cards.nth(1).getByRole('heading')).toHaveText(first)
    await expect(cards.nth(1)).toContainText('פריט אחד')

    await cards
      .nth(1)
      .getByRole('link', { name: /לפרטי ההזמנה/ })
      .click()
    await expect(page).toHaveURL(new RegExp(`/online-store/orders/${first}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'פרטי הזמנה' })).toBeVisible()
    await expect.poll(() => summaryTotal(page)).toBe(PSU.price.current)
  })

  test('says there are no orders yet for a new account', async ({ page }) => {
    await register(page, newAccount())
    await expectSignedIn(page)

    await page.goto('orders')

    await expect(page.getByRole('heading', { name: 'עדיין אין לכם הזמנות' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'לכל המוצרים' })).toBeVisible()
  })

  test('is for signed-in visitors only', async ({ page }) => {
    await page.goto('orders')

    await expect(page).toHaveURL(/\/online-store\/login$/)
  })
})
