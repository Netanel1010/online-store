import { expect, test } from '@playwright/test'
import { trackRequestFailures } from './support/requestFailures'

/**
 * Tests of the safety net itself (support/requestFailures.ts), so it can be trusted to excuse what
 * the application cancels on purpose and to keep failing everything else. They use Playwright's own
 * `test`, not the one with the safety net, because they cause failures on purpose.
 */

/** Requests the page makes to an address the test controls, which the test never answers. */
async function hangingProbes(page: import('@playwright/test').Page) {
  await page.route('**/probe/**', () => {
    // Never answered: the request stays in flight until something cancels it.
  })
}

test.describe('request failures in the safety net', () => {
  test('excuses a request the page cancelled with an AbortController', async ({ page }) => {
    const failures = await trackRequestFailures(page)
    await hangingProbes(page)
    await page.goto('')

    await page.evaluate(() => {
      const controller = new AbortController()
      fetch('/probe/cancelled-by-page', { signal: controller.signal }).catch(() => undefined)
      controller.abort()
    })

    await expect.poll(() => failures.failureCount()).toBe(1)
    expect(failures.problems()).toEqual([])
  })

  test('excuses a cancellation made through a derived signal, as the storefront does', async ({
    page,
  }) => {
    const failures = await trackRequestFailures(page)
    await hangingProbes(page)
    await page.goto('')

    await page.evaluate(() => {
      const caller = new AbortController()
      const attempt = new AbortController()
      caller.signal.addEventListener('abort', () => attempt.abort())
      fetch('/probe/derived', { signal: attempt.signal }).catch(() => undefined)
      caller.abort()
    })

    await expect.poll(() => failures.failureCount()).toBe(1)
    expect(failures.problems()).toEqual([])
  })

  test('still fails a request that was aborted without the page cancelling it', async ({
    page,
  }) => {
    const failures = await trackRequestFailures(page)
    await page.route('**/probe/aborted-elsewhere', (route) => route.abort('aborted'))
    await page.goto('')

    await page.evaluate(() => fetch('/probe/aborted-elsewhere').catch(() => undefined))

    await expect.poll(() => failures.failureCount()).toBe(1)
    expect(failures.problems()).toEqual([
      expect.stringContaining('/probe/aborted-elsewhere (net::ERR_ABORTED)'),
    ])
  })

  test('still fails a genuine network failure, even if the page cancelled that request too', async ({
    page,
  }) => {
    const failures = await trackRequestFailures(page)
    await page.route('**/probe/refused', (route) => route.abort('connectionrefused'))
    await page.goto('')

    await page.evaluate(() => {
      const controller = new AbortController()
      fetch('/probe/refused', { signal: controller.signal }).catch(() => undefined)
      // Cancelled after the browser had already failed it: it is still a connection failure.
      setTimeout(() => controller.abort(), 500)
    })

    await expect.poll(() => failures.failureCount()).toBe(1)
    expect(failures.problems()).toEqual([
      expect.stringContaining('/probe/refused (net::ERR_CONNECTION_REFUSED)'),
    ])
  })

  test('does not let a cancellation of one address excuse a failure of another', async ({
    page,
  }) => {
    const failures = await trackRequestFailures(page)
    await page.route('**/probe/one', () => {
      // Never answered: only the page's cancellation ends it.
    })
    await page.route('**/probe/other', (route) => route.abort('aborted'))
    await page.goto('')

    await page.evaluate(() => {
      const controller = new AbortController()
      fetch('/probe/one', { signal: controller.signal }).catch(() => undefined)
      controller.abort()
      fetch('/probe/other').catch(() => undefined)
    })

    await expect.poll(() => failures.failureCount()).toBe(2)
    expect(failures.problems()).toEqual([
      expect.stringContaining('/probe/other (net::ERR_ABORTED)'),
    ])
  })

  test('excuses one failure per cancellation, not every failure of that address', async ({
    page,
  }) => {
    const failures = await trackRequestFailures(page)
    let requests = 0
    await page.route('**/probe/twice', (route) => {
      requests += 1
      // The first request is left in flight for the page to cancel; the second is cut off from outside.
      if (requests > 1) return route.abort('aborted')
    })
    await page.goto('')

    await page.evaluate(() => {
      const controller = new AbortController()
      fetch('/probe/twice', { signal: controller.signal }).catch(() => undefined)
      controller.abort()
    })
    await expect.poll(() => failures.failureCount()).toBe(1)
    await page.evaluate(() => fetch('/probe/twice').catch(() => undefined))

    await expect.poll(() => failures.failureCount()).toBe(2)
    expect(failures.problems()).toEqual([
      expect.stringContaining('/probe/twice (net::ERR_ABORTED)'),
    ])
  })

  test('does not excuse an image or a script that was aborted', async ({ page }) => {
    const failures = await trackRequestFailures(page)
    await page.route('**/probe/picture.png', (route) => route.abort('aborted'))
    await page.goto('')

    await page.evaluate(() => {
      const image = new Image()
      image.src = '/probe/picture.png'
    })

    await expect.poll(() => failures.failureCount()).toBe(1)
    expect(failures.problems()).toEqual([expect.stringContaining('/probe/picture.png')])
  })
})
