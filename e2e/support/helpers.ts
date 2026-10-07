import { randomUUID } from 'node:crypto'
import type { Locator, Page } from '@playwright/test'
import { expect } from './test'
import type { CatalogProduct } from './catalog'

/**
 * Test-only credentials. They are not real, they belong to nobody, and every test registers its
 * own account in its own isolated browser, so nothing is seeded and nothing is shared.
 */
export const TEST_PASSWORD = 'Test1234pass'

export interface TestAccount {
  name: string
  email: string
  password: string
}

export function newAccount(): TestAccount {
  return {
    name: 'דנה בדיקה',
    email: `e2e-${randomUUID().slice(0, 8)}@example.com`,
    password: TEST_PASSWORD,
  }
}

/** Digits of a displayed amount ("‏2,678 ‏₪" -> 2678). */
export function amount(text: string | null): number {
  return Number((text ?? '').replace(/[^\d]/g, ''))
}

/* ----------------------------------------------------------------------------- navigation */

export const header = (page: Page) => page.getByRole('banner')

export function productCard(page: Page, product: CatalogProduct): Locator {
  return page.getByRole('article').filter({ has: page.getByRole('link', { name: product.name }) })
}

/** The product names on the page, in display order. Waits until the cards have rendered. */
export async function cardNames(page: Page): Promise<string[]> {
  await page.getByRole('article').first().waitFor()
  const names = await page.getByRole('article').getByRole('heading').allTextContents()
  return names.map((name) => name.trim())
}

/* -------------------------------------------------------------------------------- account */

export async function register(page: Page, account: TestAccount) {
  await page.goto('register')
  await fillRegistration(page, account)
  await page.getByRole('button', { name: 'יצירת חשבון' }).click()
}

export async function fillRegistration(page: Page, account: TestAccount) {
  await page.getByRole('textbox', { name: 'שם', exact: true }).fill(account.name)
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(account.email)
  await page.getByLabel(/^סיסמה/).fill(account.password)
  await page.getByLabel(/^אימות סיסמה/).fill(account.password)
}

export async function signIn(page: Page, account: Pick<TestAccount, 'email' | 'password'>) {
  await page.getByRole('textbox', { name: 'אימייל', exact: true }).fill(account.email)
  await page.getByLabel(/^סיסמה/).fill(account.password)
  await page.getByRole('button', { name: 'התחברות' }).click()
}

export async function signOut(page: Page) {
  await header(page).getByRole('button', { name: 'התנתקות', exact: true }).click()
}

export async function expectSignedIn(page: Page) {
  await expect(header(page).getByRole('button', { name: 'התנתקות', exact: true })).toBeVisible()
  await expect(header(page).getByRole('link', { name: 'התחברות' })).toHaveCount(0)
}

export async function expectSignedOut(page: Page) {
  await expect(header(page).getByRole('link', { name: 'התחברות' })).toBeVisible()
  await expect(header(page).getByRole('button', { name: 'התנתקות', exact: true })).toHaveCount(0)
}

/* ------------------------------------------------------------------------- cart, favorites */

export async function addToCartFromCard(page: Page, product: CatalogProduct) {
  await page.getByRole('button', { name: `הוספה לעגלה: ${product.name}` }).click()
}

export async function addToCartFromProductPage(page: Page, product: CatalogProduct) {
  await page.goto(`products/${product.id}`)
  await page.getByRole('button', { name: `הוספה לעגלה: ${product.name}` }).click()
}

export const cartLink = (page: Page) => header(page).getByRole('link', { name: /^עגלת קניות/ })
export const favoritesLink = (page: Page) => header(page).getByRole('link', { name: /^מועדפים/ })

/** The order summary box (cart and checkout). */
export const summary = (page: Page) => page.getByRole('complementary', { name: 'סיכום הזמנה' })

export async function summaryTotal(page: Page): Promise<number> {
  // The total is the <dd> that follows the <dt> reading exactly "סה"כ".
  const total = summary(page)
    .locator('dt', { hasText: /^סה"כ$/ })
    .locator('xpath=following-sibling::dd')
  return amount(await total.textContent())
}

/* ---------------------------------------------------------------------------------- checkout */

export async function fillDeliveryForm(page: Page) {
  await page.getByLabel('טלפון').fill('050-1234567')
  await page.getByRole('textbox', { name: 'עיר', exact: true }).fill('תל אביב')
  await page.getByRole('textbox', { name: 'רחוב', exact: true }).fill('דיזנגוף')
  await page.getByLabel('מספר בית').fill('12')
  await page.getByRole('checkbox', { name: /הזמנת הדגמה/ }).check()
}
