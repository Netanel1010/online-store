import type { Page } from '@playwright/test'
import { PSU, RAM } from './support/catalog'
import {
  expectSignedIn,
  expectSignedOut,
  header,
  newAccount,
  register,
  signIn,
  signOut,
} from './support/helpers'
import { expect, test } from './support/test'

/**
 * One browser, several people, for real. The favorites belong to whoever is using the browser: the
 * guest, or the account that is signed in, so an account never finds the favorites of the guest or of
 * another account, and finds its own again when it comes back. (The unit and component tests cover the
 * rules, the cross-tab and storage cases; this is the same, through a real browser and the real pages.)
 */
const heart = (page: Page, name: string) =>
  page.getByRole('button', { name: `מועדפים: ${name}`, exact: true })
const favoritesLink = (page: Page) => header(page).getByRole('link', { name: /^מועדפים/ })

async function openProduct(page: Page, product: { id: string; name: string }) {
  await page.goto(`products/${product.id}`)
  await expect(heart(page, product.name)).toBeVisible()
}

async function favorite(page: Page, product: { id: string; name: string }) {
  await openProduct(page, product)
  await heart(page, product.name).click()
  await expect(heart(page, product.name)).toHaveAttribute('aria-pressed', 'true')
}

async function isFavorite(page: Page, product: { id: string; name: string }) {
  await openProduct(page, product)
  return (await heart(page, product.name).getAttribute('aria-pressed')) === 'true'
}

test.describe('favorites on a shared browser', () => {
  test('an account does not see the favorites of the account before it, and finds its own when it comes back', async ({
    page,
  }) => {
    const dana = newAccount()
    const natan = newAccount()
    await register(page, dana)
    await expectSignedIn(page)
    await favorite(page, PSU)
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 1 פריטים')

    await signOut(page)
    await expectSignedOut(page)
    // The guest has a list of their own, which is empty.
    expect(await isFavorite(page, PSU)).toBe(false)
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים')

    await register(page, natan)
    await expectSignedIn(page)
    expect(await isFavorite(page, PSU)).toBe(false)
    await favorite(page, RAM)

    await signOut(page)
    await page.goto('login')
    await signIn(page, dana)
    await expectSignedIn(page)
    expect(await isFavorite(page, PSU)).toBe(true)
    expect(await isFavorite(page, RAM)).toBe(false)

    await signOut(page)
    await page.goto('login')
    await signIn(page, natan)
    await expectSignedIn(page)
    expect(await isFavorite(page, RAM)).toBe(true)
    expect(await isFavorite(page, PSU)).toBe(false)
  })

  test('what a visitor favorited before signing in is not put in the account, and is there again after signing out', async ({
    page,
  }) => {
    await favorite(page, PSU)

    await register(page, newAccount())
    await expectSignedIn(page)
    expect(await isFavorite(page, PSU)).toBe(false)

    await signOut(page)
    await expectSignedOut(page)
    expect(await isFavorite(page, PSU)).toBe(true)
  })

  test('shows the account its list as the page opens again, and the guest list once nobody is signed in', async ({
    page,
  }) => {
    await favorite(page, PSU)
    await register(page, newAccount())
    await expectSignedIn(page)
    await favorite(page, RAM)

    await page.reload()
    await expectSignedIn(page)
    await expect(heart(page, RAM.name)).toHaveAttribute('aria-pressed', 'true')
    expect(await isFavorite(page, PSU)).toBe(false)
  })

  test('lets go of the list that was kept before there was one for each person, and shows it to nobody', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('e2e-seeded')) {
        localStorage.setItem(
          'online-store:favorites',
          JSON.stringify({ state: { ids: ['OLD'] }, version: 1 }),
        )
        localStorage.setItem('e2e-seeded', '1')
      }
    })
    await page.goto('')
    await expect(header(page)).toBeVisible()

    expect(await page.evaluate(() => localStorage.getItem('online-store:favorites'))).toBeNull()
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים')
  })

  test('follows another tab of the same account, and keeps the id and the email of the account out of the key of its list', async ({
    page,
    context,
  }) => {
    const dana = newAccount()
    await register(page, dana)
    await expectSignedIn(page)
    await favorite(page, PSU)

    // A second tab of the same browser: the same account, signed in by the stored session.
    const tab = await context.newPage()
    await tab.goto('')
    await expectSignedIn(tab)
    await favorite(tab, RAM)

    // The first tab follows the change of its own list.
    await expect(favoritesLink(page)).toHaveAccessibleName('מועדפים, 2 פריטים')
    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('online-store:favorites:')),
    )
    expect(keys).toHaveLength(1)
    expect(keys[0]).toContain(':account:')
    expect(keys[0]).not.toContain(dana.email)
  })
})
