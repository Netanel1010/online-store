import type { Page } from '@playwright/test'
import { PSU, RAM } from './support/catalog'
import {
  addToCartFromProductPage,
  cartLink,
  expectSignedIn,
  fillDeliveryForm,
  newAccount,
  register,
} from './support/helpers'
import { expect, test } from './support/test'

/**
 * Two tabs of one browser, for real: both pages belong to one browser context, so they share one
 * localStorage and the browser itself sends the `storage` events between them. Nothing here is
 * simulated. (The unit tests play the other tab with a written value and a dispatched event; these
 * are what shows that the real thing behaves the same.)
 */

const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const ORDER_BUTTON = 'אישור הזמנה (הדגמה)'

/** The session token of the signed-in account, as the page keeps it. */
const token = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('online-store:session') ?? '{}').state?.token as string,
  )

const storedCart = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('online-store:cart')
    const items = raw
      ? (JSON.parse(raw).state?.items as { productId: string; quantity: number }[])
      : []
    return items.map((item) => `${item.productId}x${item.quantity}`).sort()
  })

/** The lines of the account's cart on the API (the synchronization sends them a moment after a change). */
async function apiCart(page: Page) {
  const response = await page.request.get(`${API}/api/cart`, {
    headers: { Authorization: `Bearer ${await token(page)}` },
  })
  expect(response.status()).toBe(200)
  const body = (await response.json()) as { items: { productId: string; quantity: number }[] }
  return body.items.map((item) => `${item.productId}x${item.quantity}`).sort()
}

async function apiOrderCount(page: Page) {
  const response = await page.request.get(`${API}/api/orders`, {
    headers: { Authorization: `Bearer ${await token(page)}` },
  })
  expect(response.status()).toBe(200)
  return ((await response.json()) as { total: number }).total
}

const badge = (page: Page, units: number) =>
  expect(cartLink(page)).toHaveAccessibleName(new RegExp(`, ${units} פריטים$`))

test.describe('two tabs and one cart', () => {
  test('a product added in each tab is in both tabs, in storage, on the API and in a new tab', async ({
    page,
    context,
  }) => {
    await register(page, newAccount())
    await expectSignedIn(page)
    const a = page
    const b = await context.newPage()
    await b.goto('products') // tab B is open, with an empty cart, while tab A changes the cart

    await addToCartFromProductPage(a, PSU)

    // Tab B was not reloaded and was not touched: it follows tab A.
    await badge(b, 1)

    // Tab B then adds another product. It starts from the cart that the browser keeps, not from the
    // empty cart it had when it opened, so the first product is not lost.
    await addToCartFromProductPage(b, RAM)

    await badge(b, 2)
    await badge(a, 2) // and tab A, which was not touched, follows tab B
    await expect.poll(() => storedCart(a)).toEqual([`${PSU.id}x1`, `${RAM.id}x1`].sort())
    await expect.poll(() => apiCart(a)).toEqual([`${PSU.id}x1`, `${RAM.id}x1`].sort())

    const c = await context.newPage()
    await c.goto('cart')
    await expect(c.getByRole('list').getByText(PSU.name).first()).toBeVisible()
    await expect(c.getByRole('list').getByText(RAM.name).first()).toBeVisible()
    await badge(c, 2)
  })

  test('the same product added in both tabs is counted twice, not once', async ({
    page,
    context,
  }) => {
    await register(page, newAccount())
    await expectSignedIn(page)
    const a = page
    const b = await context.newPage()
    await b.goto(`products/${PSU.id}`)

    await addToCartFromProductPage(a, PSU)
    await badge(b, 1)
    await b.getByRole('button', { name: new RegExp(`^הוספה לעגלה`) }).click()

    await badge(b, 2)
    await badge(a, 2)
    await expect.poll(() => storedCart(a)).toEqual([`${PSU.id}x2`])
    await expect.poll(() => apiCart(a)).toEqual([`${PSU.id}x2`])
  })

  test('the cart page of a tab that is open follows a change from the other tab, and says so', async ({
    page,
    context,
  }) => {
    await register(page, newAccount())
    await expectSignedIn(page)
    await addToCartFromProductPage(page, PSU)
    const a = page
    const b = await context.newPage()
    await b.goto('cart')
    await expect(b.getByRole('list').getByText(PSU.name).first()).toBeVisible()
    const notices = b.getByRole('region', { name: 'התראות' })

    await addToCartFromProductPage(a, RAM)

    await expect(b.getByRole('list').getByText(RAM.name).first()).toBeVisible()
    await expect(notices).toContainText('העגלה עודכנה מלשונית אחרת.')
    // Tab A, where the change was made, was told nothing.
    await expect(a.getByRole('region', { name: 'התראות' })).not.toContainText(
      'העגלה עודכנה מלשונית אחרת.',
    )
  })
})

test.describe('two tabs on the checkout', () => {
  /**
   * Two checkout tabs of one account, both with the form filled in, and the cart of both the power
   * supply. With `deafSecondTab` the second tab never hears the browser's `storage` event (what a
   * tab that was frozen or in the background looks like): the page asks to listen and is given
   * nothing, before any of its code runs.
   */
  async function twoCheckouts(
    page: Page,
    context: ReturnType<Page['context']>,
    { deafSecondTab = false } = {},
  ) {
    await register(page, newAccount())
    await expectSignedIn(page)
    await addToCartFromProductPage(page, PSU)
    const a = page
    const b = await context.newPage()
    if (deafSecondTab) {
      await b.addInitScript(() => {
        const listen = window.addEventListener.bind(window)
        window.addEventListener = ((type: string, ...rest: unknown[]) =>
          type === 'storage'
            ? undefined
            : (listen as (...args: unknown[]) => void)(type, ...rest)) as typeof listen
      })
    }
    for (const tab of [a, b]) {
      await tab.goto('checkout')
      await expect(tab.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()
      await fillDeliveryForm(tab)
    }
    return { a, b }
  }

  test('the second tab cannot place the order again after the first one placed it', async ({
    page,
    context,
  }) => {
    const { a, b } = await twoCheckouts(page, context)
    const ordersSentByB: string[] = []
    b.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/orders$/.test(request.url())) {
        ordersSentByB.push(request.url())
      }
    })

    await a.getByRole('button', { name: ORDER_BUTTON }).click()
    await expect(a.getByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })).toBeVisible()

    // The order emptied the cart, and tab B, which was open on the form, shows the empty cart: there
    // is no form left to submit.
    await expect(b.getByRole('heading', { name: 'העגלה ריקה' })).toBeVisible()
    await expect(b.getByRole('button', { name: ORDER_BUTTON })).toHaveCount(0)
    await expect(b.getByRole('region', { name: 'התראות' })).toContainText(
      'העגלה עודכנה מלשונית אחרת.',
    )

    expect(await apiOrderCount(a)).toBe(1)
    expect(ordersSentByB).toEqual([])
  })

  test('and also when the second tab missed the event: its click shows the empty cart and sends nothing', async ({
    page,
    context,
  }) => {
    const { a, b } = await twoCheckouts(page, context, { deafSecondTab: true })
    const ordersSentByB: string[] = []
    b.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/orders$/.test(request.url())) {
        ordersSentByB.push(request.url())
      }
    })

    await a.getByRole('button', { name: ORDER_BUTTON }).click()
    await expect(a.getByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })).toBeVisible()
    // Tab B still shows the form and the cart it had: it did not hear.
    await expect(b.getByRole('button', { name: ORDER_BUTTON })).toBeVisible()
    await badge(b, 1)

    await b.getByRole('button', { name: ORDER_BUTTON }).click()

    await expect(b.getByRole('heading', { name: 'העגלה ריקה' })).toBeVisible()
    await expect(b.getByRole('button', { name: ORDER_BUTTON })).toHaveCount(0)
    expect(ordersSentByB).toEqual([])
    expect(await apiOrderCount(a)).toBe(1)
  })

  test('a cart that the other tab changed is shown by the click, and ordered by the next one', async ({
    page,
    context,
  }) => {
    const { a, b } = await twoCheckouts(page, context, { deafSecondTab: true })

    await addToCartFromProductPage(a, RAM) // tab A adds a product; tab B does not hear
    await a.goto('checkout')
    await expect(a.getByRole('heading', { level: 1, name: 'סיום הזמנה' })).toBeVisible()
    await badge(b, 1)

    await b.getByRole('button', { name: ORDER_BUTTON }).click()

    // The click showed what the browser keeps and ordered nothing.
    await expect(b.getByRole('list', { name: 'המוצרים בהזמנה' }).getByText(RAM.name)).toBeVisible()
    await badge(b, 2)
    expect(await apiOrderCount(b)).toBe(0)

    await b.getByRole('button', { name: ORDER_BUTTON }).click()
    await expect(b.getByRole('heading', { level: 1, name: 'הזמנת ההדגמה נשמרה' })).toBeVisible()
    expect(await apiOrderCount(b)).toBe(1)
    await expect(b.getByText(PSU.name).first()).toBeVisible()
    await expect(b.getByText(RAM.name).first()).toBeVisible()
  })
})
