import type { Page } from '@playwright/test'
import { expectNoAxeViolations } from './support/a11y'
import { expect, test } from './support/test'

const SITE = 'https://netanel1010.github.io/online-store/'

const PAGES = [
  { path: 'about', label: 'אודות' },
  { path: 'contact', label: 'צור קשר' },
  { path: 'accessibility', label: 'הצהרת נגישות' },
  { path: 'privacy', label: 'מדיניות פרטיות' },
  { path: 'terms', label: 'תנאי שימוש' },
]

const footer = (page: Page) => page.getByRole('contentinfo')

test.describe('the information pages', () => {
  for (const { path, label } of PAGES) {
    test(`/${path}: is a page of its own, served as a file, with no automated accessibility violations`, async ({
      page,
    }) => {
      const raw = await page.request.get(`${path}/`)
      expect(raw.status(), 'it is a real file on GitHub Pages, not the 404 fallback').toBe(200)
      const html = await raw.text()
      expect(html).toContain(`<link rel="canonical" href="${SITE}${path}/" />`)
      expect(html).toContain(`<title>${label} | N.M.S</title>`)
      expect(html).not.toContain('noindex')

      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
      await expect(page).toHaveTitle(`${label} | N.M.S`)
      await expectNoAxeViolations(page)
    })
  }

  test('the footer lists them under "מידע", and each link opens its page', async ({ page }) => {
    await page.goto('')
    const info = footer(page).getByRole('navigation', { name: 'מידע' })
    await expect(info.getByRole('link')).toHaveText(PAGES.map((entry) => entry.label))

    for (const { path, label } of PAGES) {
      await page.goto('')
      await footer(page)
        .getByRole('navigation', { name: 'מידע' })
        .getByRole('link', { name: label })
        .click()
      await expect(page).toHaveURL(new RegExp(`/online-store/${path}/?$`))
      await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
    }
  })

  test('the footer says that this is a demo and links to the code in a new tab', async ({
    page,
  }) => {
    await page.goto('')

    await expect(footer(page).getByText('זהו אתר הדגמה: לא מתבצעת רכישה אמיתית')).toBeVisible()
    const github = footer(page).getByRole('link', { name: /קוד האתר ב-GitHub/ })
    await expect(github).toHaveAttribute('href', 'https://github.com/Netanel1010/online-store')
    await expect(github).toHaveAttribute('target', '_blank')
  })

  test('the contact page offers only the GitHub profile and repository', async ({ page }) => {
    await page.goto('contact')
    await expect(page.getByRole('heading', { level: 1, name: 'צור קשר' })).toBeVisible()

    const hrefs = await page
      .getByRole('main')
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    const external = hrefs.filter((href) => /^https?:/.test(href))
    expect(external.sort()).toEqual([
      'https://github.com/Netanel1010',
      'https://github.com/Netanel1010/online-store',
    ])
    expect(hrefs.filter((href) => /^(mailto:|tel:)|wa\.me/i.test(href))).toEqual([])
    await expect(page.getByRole('main').locator('form, input, textarea')).toHaveCount(0)
  })

  test('the terms page says that shipping and returns do not apply', async ({ page }) => {
    await page.goto('terms')

    for (const title of ['משלוחים', 'החזרות וביטולים']) {
      const section = page.locator('section', {
        has: page.getByRole('heading', { level: 2, name: title }),
      })
      await expect(section).toContainText('לא רלוונטי')
    }
  })

  test('moving to a page puts the focus on its content, as every other page does', async ({
    page,
  }) => {
    await page.goto('')
    await footer(page).getByRole('link', { name: 'אודות' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'אודות' })).toBeVisible()
    await expect(page.getByRole('main')).toBeFocused()
  })
})

test.describe('the page for an address that does not exist', () => {
  test('answers 404, offers the home page, the products and every category', async ({ page }) => {
    const response = await page.goto('no/such/page')
    expect(response?.status()).toBe(404)

    await expect(page.getByRole('heading', { level: 1, name: 'הדף לא נמצא' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'חזרה לדף הבית' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'לכל המוצרים' })).toBeVisible()
    await expect(
      page.getByRole('navigation', { name: 'המשך לקטגוריה' }).getByRole('link'),
    ).toHaveCount(12)
    await expectNoAxeViolations(page)
  })
})
