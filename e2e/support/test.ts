import { expect, test as base } from '@playwright/test'
import { trackRequestFailures } from './requestFailures'

/**
 * `test` with a safety net: any uncaught error, console error, failed request or failing asset
 * (image, script, data file) during a test fails it, even if the assertions themselves passed.
 *
 * One thing is deliberately tolerated: a deep link such as /online-store/products is answered
 * by 404.html with a 404 status when served the way GitHub Pages serves it, and the browser
 * echoes that document 404 to the console. The same goes for the API answering 404 for a product
 * that does not exist (`GET /api/products/NO-SUCH-SKU`), which the product page turns into its
 * "not found" message. Only those echoes are ignored; a 404 for any asset, any other API request
 * or any other data file still fails the test.
 *
 * Authentication has answers that are not failures but the point of the feature: 401 for a wrong
 * password or a session that has ended, 409 for an email that is taken, 429 for too many attempts
 * (`/api/auth/login`, `/register` and `/me`). The same goes for the echoes of those.
 *
 * Orders have answers of the same kind: 409 for a product that is not available or a total that is not
 * what was shown, 404 for an order that is not the account's, 401 for a session that has ended, and
 * 503 for the host being busy, which the page repeats (`/api/orders` and `/api/orders/<number>`).
 *
 * A request the page cancels on purpose (see requestFailures.ts) is not a failure either; one that
 * fails for any other reason, or is cut off without the page having cancelled it, still is.
 *
 * Playwright gives every test its own browser context, so the accounts, cart, favorites and
 * session of one test are never visible to another.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = []
      const expectedNotFound = new Set<string>()
      const failedResourceEchoes: { text: string; url: string }[] = []

      page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`))
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        if (message.text().startsWith('Failed to load resource')) {
          failedResourceEchoes.push({ text: message.text(), url: message.location().url })
        } else {
          problems.push(`console error: ${message.text()}`)
        }
      })
      const requestFailures = await trackRequestFailures(page)
      page.on('response', (response) => {
        if (response.status() < 400) return
        const type = response.request().resourceType()
        const { pathname } = new URL(response.url())
        const missingProduct = type === 'fetch' && /\/api\/products\/[^/?]+$/.test(pathname)
        const refusedAuth =
          type === 'fetch' &&
          /^\/api\/auth\/(login|register|me)$/.test(pathname) &&
          [401, 409, 429].includes(response.status())
        const refusedOrder =
          type === 'fetch' &&
          /^\/api\/orders(\/[^/]+)?$/.test(pathname) &&
          [401, 404, 409, 503].includes(response.status())
        if (
          ((type === 'document' || missingProduct) && response.status() === 404) ||
          refusedAuth ||
          refusedOrder
        ) {
          expectedNotFound.add(response.url())
        } else {
          problems.push(`HTTP ${response.status()}: ${response.url()}`)
        }
      })

      await use(problems)

      problems.push(...requestFailures.problems())

      for (const { text, url } of failedResourceEchoes) {
        if (!expectedNotFound.has(url)) problems.push(`console error: ${text} (${url})`)
      }
      expect(problems, 'the page reported errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
