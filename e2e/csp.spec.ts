import { contentSecurityPolicy, policiesOfPage } from '../scripts/csp.ts'
import { PSU } from './support/catalog'
import { expect, test } from './support/test'

/**
 * The Content-Security-Policy of the site (scripts/csp.ts), on the production build that these tests
 * run against, in a real browser. The build writes it into the template of every page as a `<meta>`
 * tag, and the API address in it is the one the build was given (`VITE_API_URL`, which Playwright sets
 * to the stub API). Every other test of the suite runs under the policy as well, and a violation is a
 * console error, which fails a test (see support/test.ts): so the shop, the account and the checkout
 * working here is the proof that none of them needs more than the policy gives.
 */
const API = `http://localhost:${process.env.E2E_API_PORT ?? 4174}`
const expected = contentSecurityPolicy(API)

test.describe('the pages that the build writes', () => {
  const pages: [what: string, path: string, status: number][] = [
    ['the home page', '', 200],
    ['the products page', 'products/', 200],
    ['a product page', `products/${PSU.id}/`, 200],
    ['a category page', `category/${PSU.category}/`, 200],
    ['an information page', 'about/', 200],
    ['the privacy page', 'privacy/', 200],
    ['a page of the app that has no file (served as 404.html)', 'cart', 404],
    ['an address that is not a page (404.html)', 'no-such-page', 404],
  ]

  for (const [what, path, status] of pages) {
    test(`${what} carries one policy tag, with the policy of the build`, async ({ request }) => {
      const response = await request.get(path)

      expect(response.status()).toBe(status)
      expect(policiesOfPage(await response.text())).toEqual([expected])
    })
  }

  test('the policy names the API of the build and nothing else outside the site', async () => {
    expect(expected).toContain(`connect-src 'self' ${API};`)
    expect(expected).not.toMatch(/unsafe-|\*|data:|blob:/)
  })
})

test.describe('the browser', () => {
  test('stops inline code, a script from elsewhere, a style attribute, a foreign image and a foreign request', async ({
    browser,
  }) => {
    // A page of its own, outside the safety net of the suite: this test breaks the policy on purpose.
    const context = await browser.newContext({ locale: 'he-IL' })
    const page = await context.newPage()
    await page.goto('')
    await expect(page.getByRole('banner')).toBeVisible()

    const result = await page.evaluate(async () => {
      const violated: string[] = []
      document.addEventListener('securitypolicyviolation', (event) =>
        violated.push(event.violatedDirective),
      )
      const flags = window as unknown as { __ran?: boolean }

      const inline = document.createElement('script')
      inline.textContent = 'window.__ran = true'
      document.head.append(inline)

      const external = document.createElement('script')
      external.src = 'https://example.com/script.js'
      document.head.append(external)

      document.body.setAttribute('style', 'outline: 5px solid red')

      const image = new Image()
      image.src = 'https://example.com/image.png'
      document.body.append(image)

      let foreignRequest = 'allowed'
      try {
        await fetch('https://example.com/')
      } catch {
        foreignRequest = 'blocked'
      }

      // Setting a style through the style object of an element is not an inline style attribute, and
      // stays allowed: it is how the page itself changes styles.
      document.body.style.outline = '1px solid blue'

      await new Promise((resolve) => setTimeout(resolve, 300))
      return {
        ran: flags.__ran === true,
        violated,
        foreignRequest,
        styleAttributeApplied: getComputedStyle(document.body).outlineWidth === '5px',
        styleObjectApplied: getComputedStyle(document.body).outlineWidth === '1px',
      }
    })
    await context.close()

    expect(result.ran).toBe(false)
    expect(result.foreignRequest).toBe('blocked')
    expect(result.styleAttributeApplied).toBe(false)
    expect(result.styleObjectApplied).toBe(true)
    expect(result.violated).toEqual(
      expect.arrayContaining(['script-src-elem', 'style-src-attr', 'img-src', 'connect-src']),
    )
  })

  test('reports a violation as a console error, which is what fails a test of this suite', async ({
    page,
    problems,
  }) => {
    await page.goto('')
    await expect(page.getByRole('banner')).toBeVisible()

    await page.evaluate(() => {
      const inline = document.createElement('script')
      inline.textContent = 'window.__ran = true'
      document.head.append(inline)
    })

    await expect
      .poll(() => problems.filter((problem) => problem.includes('Content Security Policy')).length)
      .toBeGreaterThan(0)
    // Expected here and only here: take it out, so that the safety net does not fail this test.
    problems.splice(0)
  })
})
