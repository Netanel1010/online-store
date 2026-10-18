import type { Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/a11y'
import { PSU } from './support/catalog'
import {
  addToCartFromProductPage,
  expectSignedIn,
  fillDeliveryForm,
  newAccount,
  register,
} from './support/helpers'
import { expect, test } from './support/test'

// The simulated payment in a real browser against the real API code (e2e/support/api-server.mjs), whose
// fictional provider decides an attempt in 1 second and times out in 3.

const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const ORDER_URL = /\/online-store\/orders\/(DEMO-[0-9A-Z]{8})$/

/** Registers a fresh account, places a demo order and stays on its page. */
async function anOrder(page: Page): Promise<string> {
  await register(page, newAccount())
  await expectSignedIn(page)
  await addToCartFromProductPage(page, PSU)
  await page.goto('checkout')
  await fillDeliveryForm(page)
  await page.getByRole('checkbox', { name: /הזמנת הדגמה/ }).check()
  await page.getByRole('button', { name: 'אישור הזמנה (הדגמה)' }).click()
  await expect(page).toHaveURL(ORDER_URL)
  return ORDER_URL.exec(page.url())![1]!
}

const panel = (page: Page) => page.getByRole('region', { name: 'תשלום מדומה' })
const state = (page: Page) => panel(page).getByRole('status')
const attempts = (page: Page) => panel(page).getByRole('list', { name: 'ניסיונות התשלום' })

/** The order as the API holds it, asked the way the page asks. */
async function stored(page: Page, orderNumber: string) {
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('online-store:session') ?? '{}').state?.token as string,
  )
  const response = await page.request.get(`${API}/api/orders/${orderNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as {
    payment: { state: string; attempts: { status: string; scenario: string }[] }
  }
}

test.describe('the simulated payment of an order', () => {
  test('is offered as a simulation, is approved, is refunded, and every state passes the axe scan', async ({
    page,
  }) => {
    const orderNumber = await anOrder(page)

    await expect(panel(page)).toContainText(
      'תשלום מדומה: לא נגבה כסף, לא נדרשים פרטי כרטיס, ולא יישלח מוצר.',
    )
    await expect(state(page)).toHaveText('ממתין לתשלום')
    await expect(panel(page).getByRole('textbox')).toHaveCount(0)
    await expectNoAxeViolations(page)

    await panel(page).getByRole('button', { name: 'תשלום מאושר' }).click()
    await expect(state(page)).toHaveText('בעיבוד')
    await expectNoAxeViolations(page)
    await expect(state(page)).toHaveText('שולם (מדומה)')
    await expect(attempts(page)).toContainText('ניסיון 1: תשלום מאושר · שולם (מדומה)')

    await panel(page).getByRole('button', { name: 'החזר כספי מדומה' }).click()
    await expect(state(page)).toHaveText('הוחזר (מדומה)')
    await expectNoAxeViolations(page)
    expect((await stored(page, orderNumber)).payment.state).toBe('refunded')

    // The same after a reload: the page shows what the server stored.
    await page.reload()
    await expect(state(page)).toHaveText('הוחזר (מדומה)')
  })

  test('is declined, then approved on a second attempt', async ({ page }) => {
    const orderNumber = await anOrder(page)

    await panel(page).getByRole('button', { name: 'תשלום נדחה' }).click()
    const again = panel(page).getByRole('group', { name: 'לנסות שוב' })
    await expect(again).toBeVisible()
    await expect(attempts(page)).toContainText('ניסיון 1: תשלום נדחה · נכשל')

    await again.getByRole('button', { name: 'תשלום מאושר' }).click()
    await expect(state(page)).toHaveText('שולם (מדומה)')
    expect(
      (await stored(page, orderNumber)).payment.attempts.map((attempt) => attempt.status),
    ).toEqual(['failed', 'succeeded'])
  })

  test('times out when the provider never answers, and is cancelled by the visitor before it is decided', async ({
    page,
  }) => {
    const orderNumber = await anOrder(page)

    await panel(page).getByRole('button', { name: 'הספק לא עונה' }).click()
    await expect(state(page)).toHaveText('בעיבוד')
    await expect(attempts(page)).toContainText('פג הזמן', { timeout: 8_000 })

    await panel(page).getByRole('button', { name: 'הספק לא עונה' }).click()
    await panel(page).getByRole('button', { name: 'ביטול הניסיון' }).click()
    await expect(attempts(page)).toContainText('ניסיון 2: הספק לא עונה · בוטל')
    await expect(state(page)).toHaveText('ממתין לתשלום')
    expect(
      (await stored(page, orderNumber)).payment.attempts.map((attempt) => attempt.status),
    ).toEqual(['timed_out', 'cancelled'])
  })

  test('records a duplicate approval once, and a cancellation by the provider', async ({
    page,
  }) => {
    await anOrder(page)

    await panel(page).getByRole('button', { name: 'ביטול אצל הספק' }).click()
    await expect(attempts(page)).toContainText('ניסיון 1: ביטול אצל הספק · בוטל')

    await panel(page).getByRole('button', { name: 'אישור כפול מהספק' }).click()
    await expect(panel(page)).toContainText('הספק שלח את האישור פעמיים. השני לא שינה דבר.')
    await expect(state(page)).toHaveText('שולם (מדומה)')
  })

  test('sends a start whose answer was lost again with the same key, and makes one attempt', async ({
    page,
  }) => {
    const orderNumber = await anOrder(page)
    const keys: string[] = []
    let dropped = false
    await page.route('**/payment/attempts', async (route) => {
      keys.push(route.request().headers()['idempotency-key'] ?? '')
      // The first request reaches the API, which starts the attempt; the browser gets back something
      // that is not the order (as in orders.spec.ts: the suite fails any request that fails).
      const response = await route.fetch()
      if (!dropped) {
        dropped = true
        await route.fulfill({
          response,
          status: 200,
          contentType: 'text/html',
          body: '<html>The gateway cut the answer short</html>',
        })
        return
      }
      await route.fulfill({ response })
    })

    await panel(page).getByRole('button', { name: 'תשלום מאושר' }).click()
    await expect(panel(page)).toContainText('אי אפשר להתחבר לשרת כרגע')
    // The page read the order again: the attempt that was made is shown.
    await expect(attempts(page)).toContainText('ניסיון 1: תשלום מאושר')
    expect((await stored(page, orderNumber)).payment.attempts).toHaveLength(1)
    expect(new Set(keys).size).toBe(1)
  })

  test('shows its state in the list of orders', async ({ page }) => {
    await anOrder(page)
    await panel(page).getByRole('button', { name: 'תשלום מאושר' }).click()
    await expect(state(page)).toHaveText('שולם (מדומה)')

    await page.goto('orders')
    const list = page.getByRole('list', { name: 'ההזמנות שלי' })
    await expect(list).toContainText('שולם (מדומה)')
    await expectNoAxeViolations(page)
  })
})
