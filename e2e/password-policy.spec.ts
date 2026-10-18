import {
  expectSignedIn,
  expectSignedOut,
  fillRegistration,
  newAccount,
  register,
  signIn,
  signOut,
} from './support/helpers'
import { expect, test } from './support/test'

/**
 * The rules for a new password, through a real browser and the real API: any text of eight characters or
 * more is a password, in any language and with spaces and emoji, except the passwords that everyone tries
 * first and the address of the account. (The rules themselves, and what the form and the API each say, are
 * tried by the unit and component tests; this is that they hold on the production build, under the
 * Content-Security-Policy, with the API's own answer.)
 */
test.describe('the password of a new account', () => {
  test('tells the visitor what a password may be', async ({ page }) => {
    await page.goto('register')

    await expect(page.getByLabel(/^סיסמה/)).toHaveAccessibleDescription(
      'לפחות 8 תווים. אפשר להשתמש באותיות, בספרות, ברווחים ובסימנים.',
    )
  })

  test('refuses a common password and the address of the account, and creates nothing', async ({
    page,
  }) => {
    const account = newAccount()
    await page.goto('register')

    await fillRegistration(page, { ...account, password: 'password1' })
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()
    await expect(page.getByText('הסיסמה הזו נפוצה מדי. בחרו סיסמה אחרת.')).toBeVisible()

    await fillRegistration(page, { ...account, password: account.email.toUpperCase() })
    await page.getByRole('button', { name: 'יצירת חשבון' }).click()
    await expect(page.getByText('הסיסמה לא יכולה להיות זהה לכתובת האימייל.')).toBeVisible()
    await expectSignedOut(page)
  })

  test('accepts a phrase with spaces, Hebrew and an emoji, and signs in with it later', async ({
    page,
  }) => {
    const account = { ...newAccount(), password: 'סיסמה ארוכה עם רווחים 🔒' }

    await register(page, account)
    await expectSignedIn(page)

    await signOut(page)
    await expectSignedOut(page)
    await page.goto('login')
    await signIn(page, account)
    await expectSignedIn(page)
  })

  test('does not trim the password: the same phrase with a space at the end is another password', async ({
    page,
  }) => {
    const account = { ...newAccount(), password: ' a phrase with spaces around it ' }
    await register(page, account)
    await expectSignedIn(page)
    await signOut(page)

    await page.goto('login')
    await signIn(page, { ...account, password: account.password.trim() })

    await expect(page).toHaveURL(/\/login$/)
    await expectSignedOut(page)
  })
})
