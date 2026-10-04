import { expect, test as base } from '@playwright/test'

/**
 * `test` with a safety net: any uncaught error, console error, failed request or failing asset
 * (image, script, data file) during a test fails it, even if the assertions themselves passed.
 *
 * One thing is deliberately tolerated: a deep link such as /online-store/products is answered
 * by 404.html with a 404 status when served the way GitHub Pages serves it, and the browser
 * echoes that document 404 to the console. Only that echo is ignored; a 404 for any asset or
 * data file still fails the test.
 *
 * Playwright gives every test its own browser context, so the accounts, cart, favorites and
 * session of one test are never visible to another.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = []
      const documentNotFound = new Set<string>()
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
      page.on('requestfailed', (request) =>
        problems.push(`request failed: ${request.url()} (${request.failure()?.errorText})`),
      )
      page.on('response', (response) => {
        if (response.status() < 400) return
        if (response.request().resourceType() === 'document' && response.status() === 404) {
          documentNotFound.add(response.url())
        } else {
          problems.push(`HTTP ${response.status()}: ${response.url()}`)
        }
      })

      await use(problems)

      for (const { text, url } of failedResourceEchoes) {
        if (!documentNotFound.has(url)) problems.push(`console error: ${text} (${url})`)
      }
      expect(problems, 'the page reported errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
