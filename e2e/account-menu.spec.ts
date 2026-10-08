import type { Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/a11y'
import { accountButton, header, newAccount, openAccountMenu, register } from './support/helpers'
import { expect, test } from './support/test'

const WIDTHS = [320, 375, 768, 1280]

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

const panelOf = async (page: Page) =>
  header(page).locator(`[id="${await accountButton(page).getAttribute('aria-controls')}"]`)

test.describe('the account menu of the header', () => {
  for (const width of WIDTHS) {
    test(`is one button at ${width}px, and its panel opens inside the screen`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await register(page, newAccount())

      await expect(accountButton(page)).toBeVisible()
      await expect(accountButton(page)).toHaveAttribute('aria-expanded', 'false')
      await expect(await panelOf(page)).toBeHidden()

      const panel = await openAccountMenu(page)
      await expect(panel).toBeVisible()
      const box = (await panel.boundingBox())!
      expect(box.x, 'the panel starts left of the screen').toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, 'the panel ends right of the screen').toBeLessThanOrEqual(width)
      expect(await hasHorizontalScroll(page), 'the page scrolls sideways').toBe(false)
      // The button is at least a comfortable touch target at every width.
      const button = (await accountButton(page).boundingBox())!
      expect(button.height).toBeGreaterThanOrEqual(44)
      expect(button.width).toBeGreaterThanOrEqual(44)
    })
  }

  test('works with the keyboard: Enter opens, Tab walks the items, Escape closes and returns the focus', async ({
    page,
  }) => {
    await register(page, newAccount())
    await accountButton(page).focus()

    await page.keyboard.press('Enter')
    await expect(accountButton(page)).toHaveAttribute('aria-expanded', 'true')
    const panel = await panelOf(page)
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('link', { name: 'ההזמנות שלי' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button', { name: 'התנתקות', exact: true })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button', { name: 'התנתקות מכל המכשירים' })).toBeFocused()

    await page.keyboard.press('Escape')

    await expect(accountButton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(accountButton(page)).toBeFocused()
    await expect(panel).toBeHidden()
  })

  test('closes when the focus tabs out of it, and when the visitor clicks elsewhere', async ({
    page,
  }) => {
    await register(page, newAccount())
    await openAccountMenu(page)
    await accountButton(page).focus()
    for (let step = 0; step < 4; step += 1) await page.keyboard.press('Tab')

    await expect(accountButton(page)).toHaveAttribute('aria-expanded', 'false')

    await openAccountMenu(page)
    await page.getByRole('heading', { level: 1 }).click()
    await expect(accountButton(page)).toHaveAttribute('aria-expanded', 'false')
  })

  test('shows the focus ring on the button and on the first item', async ({ page }) => {
    await register(page, newAccount())
    const ring = (target: ReturnType<typeof accountButton>) =>
      target.evaluate((element) => {
        const style = getComputedStyle(element)
        return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) }
      })
    await accountButton(page).focus()
    await page.keyboard.press('Enter') // opens it: the focus is now shown for the keyboard

    expect((await ring(accountButton(page))).style).not.toBe('none')
    expect((await ring(accountButton(page))).width).toBeGreaterThan(0)
    await page.keyboard.press('Tab')
    const item = (await panelOf(page)).getByRole('link', { name: 'ההזמנות שלי' })
    await expect(item).toBeFocused()
    expect((await ring(item)).style).not.toBe('none')
    expect((await ring(item)).width).toBeGreaterThan(0)
  })

  test('has no automated accessibility violations with the panel open', async ({ page }) => {
    await register(page, newAccount())
    await openAccountMenu(page)

    await expectNoAxeViolations(page)
  })

  test('goes to the orders from the panel and closes it', async ({ page }) => {
    await register(page, newAccount())
    const panel = await openAccountMenu(page)

    await panel.getByRole('link', { name: 'ההזמנות שלי' }).click()

    await expect(page).toHaveURL(/\/online-store\/orders$/)
    await expect(page.getByRole('heading', { level: 1, name: 'ההזמנות שלי' })).toBeVisible()
    await expect(accountButton(page)).toHaveAttribute('aria-expanded', 'false')
  })
})
