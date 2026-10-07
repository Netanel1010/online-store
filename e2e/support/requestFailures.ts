import type { Page } from '@playwright/test'

interface Failure {
  url: string
  type: string
  error: string
}

/**
 * Tells a request the page cancelled itself from one that failed. The storefront cancels requests
 * on purpose (a filter changes while the listing is still loading, a page is left): the browser
 * reports those as `net::ERR_ABORTED`, exactly like a request that was cut off for another reason,
 * and the safety net in `test.ts` used to fail the test for both. That made the suite flaky,
 * because whether a cancelled request is reported before the test ends depends on timing.
 *
 * Nothing is ignored by its error text. The page is made to say which requests it cancelled: a
 * wrapper around `fetch` reports every request whose `AbortSignal` is aborted. A failure is excused
 * only when it is `ERR_ABORTED`, it is a fetch or XHR, and the page cancelled that very address.
 * Anything else still fails: another error, a navigation that cut a request off, a cancellation of
 * a different address, or an image or script that was aborted.
 *
 * The decision is made when the test ends (`problems`), so it does not matter whether the page's
 * report or the browser's failure arrives first.
 */
export async function trackRequestFailures(page: Page) {
  const cancelledByPage: string[] = []
  const failures: Failure[] = []

  await page.exposeFunction('__e2eCancelledByPage', (url: string) => cancelledByPage.push(url))
  await page.addInitScript(() => {
    const report = (window as unknown as Record<string, (url: string) => void>)
      .__e2eCancelledByPage!
    const originalFetch = window.fetch
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      const request = input instanceof Request ? input : null
      const address = new URL(request ? request.url : String(input), location.href).href
      const signal = init?.signal ?? request?.signal
      signal?.addEventListener('abort', () => report(address), { once: true })
      return originalFetch.call(this, input, init)
    }
  })
  page.on('requestfailed', (request) =>
    failures.push({
      url: request.url(),
      type: request.resourceType(),
      error: request.failure()?.errorText ?? 'unknown error',
    }),
  )

  return {
    /** How many failed requests the browser has reported so far. */
    failureCount: () => failures.length,
    /** The failures that were not a cancellation by the page, as messages. */
    problems(): string[] {
      const unmatched = [...cancelledByPage]
      return failures
        .filter((failure) => {
          const cancellable =
            failure.error === 'net::ERR_ABORTED' && /^(fetch|xhr)$/.test(failure.type)
          const index = cancellable ? unmatched.indexOf(failure.url) : -1
          if (index === -1) return true
          // One cancellation excuses one failure.
          unmatched.splice(index, 1)
          return false
        })
        .map((failure) => `request failed: ${failure.url} (${failure.error})`)
    },
  }
}
