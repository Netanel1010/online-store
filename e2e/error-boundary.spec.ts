import { expect, test } from '@playwright/test'

/**
 * A page of the site that is loaded on demand can fail to load, typically after a new deployment:
 * the visitor still has the old version open and the file it asks for is gone. These tests make that
 * happen for real by refusing the file. They use Playwright's own `test`, not the one with the
 * safety net, because a failed request and an error in the console are what is being tested.
 */
test.describe('a page that cannot be loaded', () => {
  test('shows a message in place of the page, keeps the header, and loading the site again fixes it', async ({
    page,
  }) => {
    await page.goto('')
    const login = page.getByRole('banner').getByRole('link', { name: 'התחברות' })
    await expect(login).toBeVisible()

    // The file of the sign-in page is gone.
    await page.route('**/assets/LoginPage-*.js', (route) => route.abort('failed'))
    await login.click()

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('גרסה חדשה של האתר זמינה')
    // Not a blank page: the layout is still there and the visitor can go elsewhere.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await expect(alert.getByRole('link', { name: 'לדף הבית' })).toBeVisible()
    // Trying again would fail the same way (a failed import is remembered), so it is not offered.
    await expect(alert.getByRole('button', { name: 'נסו שוב' })).toHaveCount(0)

    // The file is available again (the site was loaded again, as a visitor would).
    await page.unroute('**/assets/LoginPage-*.js')
    await alert.getByRole('button', { name: 'רענון העמוד' }).click()

    await expect(page).toHaveURL(/\/online-store\/login$/)
    await expect(page.getByRole('heading', { name: 'התחברות', level: 1 })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('going to another page clears the message', async ({ page }) => {
    await page.goto('')
    await page.route('**/assets/LoginPage-*.js', (route) => route.abort('failed'))
    await page.getByRole('banner').getByRole('link', { name: 'התחברות' }).click()
    await expect(page.getByRole('alert')).toContainText('גרסה חדשה של האתר זמינה')

    await page.getByRole('alert').getByRole('link', { name: 'לדף הבית' }).click()

    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'באנרים' })).toBeVisible()
  })
})
