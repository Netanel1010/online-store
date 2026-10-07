import type { Page } from '@playwright/test'
import { PSU, RAM } from './support/catalog'
import {
  addToCartFromProductPage,
  cartLink,
  expectSignedIn,
  expectSignedOut,
  header,
  newAccount,
  register,
  signIn,
  signOut,
} from './support/helpers'
import { expect, test } from './support/test'

const CART_KEY = 'online-store:cart'
const isCartSave = (response: { url: () => string; request: () => { method: () => string } }) =>
  response.url().includes('/api/cart/items/') && response.request().method() === 'PUT'

/** Waits for the answer to the next save of a cart line, so that "the account has it" is certain. */
const nextSave = (page: Page) => page.waitForResponse(isCartSave)

test.describe('the cart of the account', () => {
  test('is kept by the account: signing out empties this browser and signing in brings it back', async ({
    page,
  }) => {
    const account = newAccount()
    await register(page, account)
    await expectSignedIn(page)

    const saved = nextSave(page)
    await addToCartFromProductPage(page, PSU)
    expect((await saved).ok()).toBe(true)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')

    await signOut(page)
    await expectSignedOut(page)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות')
    expect(await page.evaluate((key) => localStorage.getItem(key), CART_KEY)).toContain('[]')

    await header(page).getByRole('link', { name: 'התחברות' }).click()
    await signIn(page, account)
    await expectSignedIn(page)

    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')
    await page.goto('cart')
    await expect(page.getByRole('link', { name: PSU.name, exact: true })).toBeVisible()
  })

  test('is read from the API on a browser that has never seen it', async ({ page }) => {
    const account = newAccount()
    await register(page, account)
    await expectSignedIn(page)
    const saved = nextSave(page)
    await addToCartFromProductPage(page, PSU)
    await saved
    // As if this were another computer: no cart in the browser, only the session.
    await page.evaluate((key) => localStorage.removeItem(key), CART_KEY)

    await page.goto('cart')

    await expect(page.getByRole('link', { name: PSU.name, exact: true })).toBeVisible()
    await expect(page.getByText('העגלה ריקה')).toHaveCount(0)
  })

  test('joins the cart of a visitor with the cart of the account at sign-in', async ({ page }) => {
    const account = newAccount()
    await register(page, account)
    await expectSignedIn(page)
    const saved = nextSave(page)
    await addToCartFromProductPage(page, PSU)
    await saved
    await signOut(page)
    await expectSignedOut(page)

    // Signed out, a new product goes in the cart; signing in then joins the two.
    await addToCartFromProductPage(page, RAM)
    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 1 פריטים')
    await header(page).getByRole('link', { name: 'התחברות' }).click()
    await signIn(page, account)
    await expectSignedIn(page)

    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 2 פריטים')
    await page.goto('cart')
    await expect(page.getByRole('link', { name: PSU.name, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: RAM.name, exact: true })).toBeVisible()
  })

  test('follows the changes made on the cart page', async ({ page }) => {
    await register(page, newAccount())
    await expectSignedIn(page)
    await addToCartFromProductPage(page, PSU)
    await page.goto('cart')
    // The save of the new quantity, not the earlier save of the first unit.
    const saved = page.waitForResponse(
      (response) => isCartSave(response) && response.request().postDataJSON().quantity === 2,
    )
    await page.getByRole('button', { name: `הגדלת כמות: ${PSU.name}` }).click()
    expect((await saved).ok()).toBe(true)
    await page.evaluate((key) => localStorage.removeItem(key), CART_KEY)

    await page.reload()

    await expect(cartLink(page)).toHaveAccessibleName('עגלת קניות, 2 פריטים')
  })
})
